// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// Direct memory for 7z dictionaries too large for the title's heap. The heap is a few hundred MiB of flexible
// memory (native_host's "heap:" line), while 7-Zip's larger presets declare LZMA2 dictionaries of 128 MiB to
// 1.5 GiB: 0.5.5 refused those, 246 of its 251 "needs more memory" reports. A title also has the console's
// direct memory, mapped for the CPU the way the video decoder and other PS5 homebrew map large blocks. The link
// wraps lzma_raw_decoder (tools/build_ps5.py), the call libarchive's 7z reader builds each LZMA and LZMA2
// decoder with, to give that stream an allocator that takes blocks from archives::lzma_window_threshold up
// from direct memory and leaves smaller ones to malloc.
#include "big_memory.hpp"
#include "archive_preflight.hpp"
#include "async_log.hpp"
#include <lzma.h>
#include <cstdint>
#include <cstdlib>
#include <mutex>
#include <vector>

extern "C" {
int sceKernelAllocateDirectMemory(std::int64_t start, std::int64_t end, std::size_t length, std::size_t alignment,
                                  int type, std::int64_t* physical);
int sceKernelMapDirectMemory(void** address, std::size_t length, int protection, int flags, std::int64_t physical,
                             std::size_t alignment);
int sceKernelReleaseDirectMemory(std::int64_t physical, std::size_t length);
int sceKernelMunmap(void* address, std::size_t length);
std::int64_t sceKernelGetDirectMemorySize();
int sceKernelAvailableDirectMemorySize(std::int64_t start, std::int64_t end, std::size_t alignment, std::int64_t* found,
                                       std::size_t* size);
lzma_ret __real_lzma_raw_decoder(lzma_stream* stream, const lzma_filter* filters);
}

namespace {
constexpr std::size_t MiB = 1024 * 1024;
// 2 MiB pages, the alignment other PS5 homebrew maps large blocks with.
constexpr std::size_t alignment = 2 * MiB;
// Left free for what the GPU and the system still take after launch.
constexpr std::size_t reserve = 512 * MiB;
// The memory type and CPU and GPU read/write protection the video decoder maps its frames with.
constexpr int memory_type = 12;
constexpr int protection = 0x33;
// What the heap took before 0.5.6: the preflight's 64 MiB budget, and the few hundred bytes liblzma asks for
// beyond a dictionary.
constexpr std::size_t heap_window = 65 * MiB;

struct Block {
  void* address = nullptr;
  std::int64_t physical = -1;
  std::size_t length = 0;
};
std::mutex blocks_lock;
std::vector<Block> blocks;

std::size_t largest_free() {
  std::int64_t found = 0;
  std::size_t size = 0;
  return sceKernelAvailableDirectMemorySize(0, sceKernelGetDirectMemorySize(), alignment, &found, &size) == 0 ? size : 0;
}

std::size_t pages(std::size_t bytes) { return (bytes + alignment - 1) & ~(alignment - 1); }

int map(std::size_t length, Block& block) {
  block = {nullptr, -1, length};
  int rc = sceKernelAllocateDirectMemory(0, sceKernelGetDirectMemorySize(), length, alignment, memory_type, &block.physical);
  if (rc == 0 && (rc = sceKernelMapDirectMemory(&block.address, length, protection, 0, block.physical, alignment)) != 0)
    sceKernelReleaseDirectMemory(block.physical, length);
  return rc;
}

void unmap(const Block& block) {
  sceKernelMunmap(block.address, block.length);
  sceKernelReleaseDirectMemory(block.physical, block.length);
}

void* take(void*, std::size_t count, std::size_t size) {
  if (size && count > SIZE_MAX / size) return nullptr;
  const auto bytes = count * size;
  if (bytes < archives::lzma_window_threshold) return std::malloc(bytes);
  Block block;
  if (const int rc = map(pages(bytes), block)) {
    // What fit the heap before still goes there; anything larger gets LZMA_MEM_ERROR from liblzma, and the
    // extraction fails with a message instead of the title aborting.
    async_log::write("[PS5-REACT] direct memory: %zu MiB for a decoder refused (0x%08x), largest free block %zu MiB%s",
                     block.length / MiB, static_cast<unsigned>(rc), largest_free() / MiB,
                     bytes <= heap_window ? "; it goes on the heap" : "");
    return bytes <= heap_window ? std::malloc(bytes) : nullptr;
  }
  {
    std::lock_guard<std::mutex> hold(blocks_lock);
    blocks.push_back(block);
  }
  async_log::write("[PS5-REACT] direct memory: %zu MiB for a decoder, largest free block %zu MiB", block.length / MiB,
                   largest_free() / MiB);
  return block.address;
}

void give_back(void*, void* address) {
  if (!address) return;
  {
    std::lock_guard<std::mutex> hold(blocks_lock);
    for (auto block = blocks.begin(); block != blocks.end(); ++block) {
      if (block->address != address) continue;
      unmap(*block);
      blocks.erase(block);
      return;
    }
  }
  std::free(address);
}

const lzma_allocator allocator{take, give_back, nullptr};

// The preflight's question, asked before a download: can a dictionary this large be had now? The block is taken
// and given back, so a 7z is admitted only when its extraction will get it, keeping `reserve` free.
bool window_fits(std::uint64_t bytes) {
  // liblzma asks for a few hundred bytes beyond the dictionary, which can take one more page.
  const auto length = pages(static_cast<std::size_t>(bytes) + alignment);
  const auto free = largest_free();
  Block block;
  int rc = free > reserve && length <= free - reserve ? map(length, block) : -1;
  if (rc == 0) unmap(block);
  async_log::write("[PS5-REACT] direct memory: a %llu MiB 7z dictionary %s (0x%08x), largest free block %zu MiB",
                   static_cast<unsigned long long>(bytes / MiB), rc == 0 ? "fits" : "does not fit",
                   static_cast<unsigned>(rc), free / MiB);
  return rc == 0;
}
} // namespace

// libarchive leaves a stream's allocator unset; liblzma frees with whichever one the stream holds.
extern "C" lzma_ret __wrap_lzma_raw_decoder(lzma_stream* stream, const lzma_filter* filters) {
  if (stream && !stream->allocator) stream->allocator = &allocator;
  return __real_lzma_raw_decoder(stream, filters);
}

void big_memory::install() {
  archives::lzma_window_fits = window_fits;
  async_log::write("[PS5-REACT] direct memory: %lld MiB in all, largest free block %zu MiB",
                   static_cast<long long>(sceKernelGetDirectMemorySize() / static_cast<std::int64_t>(MiB)), largest_free() / MiB);
}
