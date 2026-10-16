// The app's one Make Room runner, built the first time a screen needs it, and what holds a game in place.

import { createRoomRunner, roomRunner } from './room-runner.js';
import { deleteFile, moveFile } from '../files/useFiles.js';
import { BUSY } from '../state/download-queue.js';
import { downloadQueue } from '../state/downloads.js';
import { refreshDrives } from '../state/drives.js';
import { FileSystem } from '@ps5-react/core';

  var freeOf = async (root) => (typeof FileSystem.diskUsageAsync === "function" ? await FileSystem.diskUsageAsync(root) : FileSystem.diskUsage(root)).free;
  var runner = () => roomRunner(() => createRoomRunner({ queue: downloadQueue(), fs: FileSystem, deleteFile, moveFile, freeOf, refresh: refreshDrives }));
  var related = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  var pathsOf = (entry) => [...entry.jobs.flatMap((job) => [job.artifact?.destination, ...job.artifact?.images ?? []]), ...entry.files.map((file) => file.path)].filter(Boolean);
  /**
   * Why a game cannot be moved or deleted now, or null: being deleted, moving (here or in Make Room),
   * another of its downloads running, or one of its images mounted by ShadowMount (`mounts`: useMounts()).
   */
  function heldReason(entry, { jobs, mounts, room }) {
    if (entry.removing) return "removing";
    if (room?.entries?.[entry.key] || entry.jobs.some((job) => job.moving && !job.moving.interrupted)) return "moving";
    if (jobs.some((job) => job.gameId === entry.game.id && BUSY.includes(job.state))) return "downloading";
    const paths = pathsOf(entry);
    if ((mounts?.images ?? []).some((image) => image.mounted && paths.some((path) => related(path, image.path)))) return "mounted";
    return null;
  }

export { heldReason, runner };
