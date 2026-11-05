<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/logo-dark.svg">
    <img src=".github/readme/logo-light.svg" alt="Jobee'sLair" width="440">
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <b>Русский</b>
</p>

<p align="center">
  <b>Менеджер загрузок для homebrew на PS5 с открытым исходным кодом.</b><br>
  Title ID <code>PPSA99471</code> · автор: JVK3R<br>
  <i>Proudly created alongside AI by JVK3R</i>
</p>

<p align="center">
  <a href="https://github.com/JVK3R/JobeesLair/releases/latest"><img src="https://img.shields.io/github/v/release/JVK3R/JobeesLair?style=for-the-badge&label=Download&color=e5322d" alt="Скачать последнюю версию"></a>
  <a href="https://github.com/JVK3R/JobeesLair/releases"><img src="https://img.shields.io/github/downloads/JVK3R/JobeesLair/total?style=for-the-badge&label=Downloads&color=2b3240" alt="Всего загрузок"></a>
  <a href="https://ko-fi.com/jvk3r"><img src="https://img.shields.io/badge/Support-Ko--fi-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white" alt="Поддержать Jobee'sLair на Ko-fi"></a>
  <a href="https://discord.gg/w5dtAMBVgZ"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Наш Discord"></a>
</p>

<p align="center">
  <a href="INSTALLATION-GUIDE.md">Руководство по установке (англ.)</a> ·
  <a href="CHANGELOG.md">Список изменений (англ.)</a> ·
  <a href="FEEDS.md">Фиды каталога (англ.)</a> ·
  <a href="#поддержать-jobeeslair">Поддержать</a> ·
  <a href="https://jobees.org">jobees.org</a> ·
  <a href="https://github.com/JVK3R/JobeesLair-PS4">Версия для PS4</a>
</p>

> [!IMPORTANT]
> **Все официальные новости — только в Discord и Twitter:**
> [Discord](https://discord.gg/w5dtAMBVgZ) · [Twitter / X (@jvk3r_)](https://x.com/jvk3r_)

> [!WARNING]
> **Вы сами отвечаете за то, что скачиваете.** Скачивайте только то, чем вы законно владеете или на что у
> вас есть разрешение: собственные резервные копии, homebrew, бесплатные программы. Jobee'sLair ничего не
> размещает и не распространяет; см. [уведомление о нейтральности контента и DMCA](#нейтральность-контента-и-уведомление-dmca).

<p align="center">
  <img src=".github/readme/ps5-discover.webp" alt="Главный экран Jobee'sLair: панель навигации, избранная игра и ряд «Featured»" width="100%">
</p>

> [!TIP]
> **Jobee'sLair бесплатен, и его делает один человек.** Если он вам полезен, [поддержите его на Ko-fi](https://ko-fi.com/jvk3r)
> или [криптовалютой](#поддержать-jobeeslair). Пожертвования оплачивают серверы и новые обновления.

Jobee'sLair — это обозреватель каталога и менеджер загрузок для PS5 с джейлбрейком и
[ShadowMount+](https://github.com/drakmor/ShadowMountPlus). Код открыт, чтобы его нельзя было закрыть или
потерять: любой может прочитать, собрать, исправить и сделать форк.

## Возможности

- **Homebrew, отдельный раздел:** более 300 открытых приложений, эмуляторов, портов и пейлоадов для PS5 со
  своими иконками. Устанавливаются и обновляются прямо из релизов авторов на GitHub (ничего не
  перезаливается). Приложения попадают в `homebrew/` для ShadowMount+, пейлоады запускаются через ваш
  ELF-загрузчик одной кнопкой.
- **Каталог и загрузки:** встроенный каталог игр и до 4 собственных фидов (с зеркалами, чтобы
  фид пережил отключение домена). Загрузка идёт сразу во внутреннюю память или на USB-накопитель, а
  выбранный накопитель запоминается.
- **Пометки у каждого источника:** что это (Folder Dump, .exfat Image, FFPKG, Backport), запустится ли на
  прошивке 13.60 (**13.60 Ready**) и жива ли ссылка (**Broken link**, **Offline**). Ссылка, которая перестала
  работать у других игроков, помечается и у вас. Ничего не скрывается, источники только ранжируются.
- **Загрузки следят за собой сами:** прерванная загрузка повторяется сама, а архивы распаковываются за вас,
  даже архив внутри архива.
- **Ссылки из браузера консоли ловятся сами:** вводить ссылки геймпадом не нужно. Приложение **запоминает,
  какие хосты работают** на вашей консоли (**Auto-capture** / **Rarely works here**).
- **TorBox и AllDebrid (по желанию):** укажите ключ в настройках, и поддерживаемые хосты скачиваются на
  полной скорости без браузера.
- **Библиотека, время в игре и Make Room:** что установлено и сколько вы играли, безопасное освобождение
  места, перенос игр между накопителями и причина, **почему игра не запускается**, вместе с тем, как часто
  она запускается у других игроков.
- **Телефон-компаньон:** живая панель, очередь, игры и homebrew (установка, обновление, запуск, удаление),
  библиотека с Fix it и пульт с телефона, на языке консоли. Загрузки и установки обновляются на телефоне сразу.
  Выключен, пока вы его не включите, а шестизначный PIN выбираете вы. Экспериментально: может работать и при
  закрытом Jobee'sLair, чтобы открыть приложение или запустить пейлоад.
- **Ввод с клавиатуры самой PS5** для поиска, ссылок и ключей, на вашем языке (или клавиатура приложения с
  результатами по мере ввода, если она вам удобнее).
- **Обновления из приложения**, ограничение скорости, шесть акцентных цветов, индикатор на DualSense и
  14 языков.

<p align="center">
  <img src=".github/readme/ps5-homebrew.webp" alt="Раздел Homebrew: эмулятор в центре внимания и категории" width="49%">
  <img src=".github/readme/ps5-homebrew-lists.webp" alt="Списки Homebrew: самые популярные приложения и свежие релизы" width="49%">
</p>

<p align="center">
  <img src=".github/readme/ps5-companion.webp" alt="Настройки: телефон-компаньон с QR-кодом, адресом и PIN" width="49%">
  <img src=".github/readme/ps5-about.webp" alt="Настройки, «О программе и благодарности»: версия, проверка обновлений и поддержка разработки" width="49%">
</p>

## Поддержать Jobee'sLair

Jobee'sLair бесплатен и с открытым кодом, и его делает один человек. Пожертвования оплачивают то, на чём он
держится: серверы живого каталога, проверки обновлений и отчёты об ошибках, а также время, которое уходит на
каждый выпуск. В приложении ничего не заблокировано и не урезано, и так будет всегда. Пожертвование — это
благодарность, а не обязанность.

<p align="center">
  <a href="https://ko-fi.com/jvk3r"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Поддержать Jobee'sLair на Ko-fi" height="40"></a>
</p>

| Способ | Куда |
| --- | --- |
| **Ko-fi** | [ko-fi.com/jvk3r](https://ko-fi.com/jvk3r): карта, Apple Pay или Google Pay, разово или ежемесячно |
| **Bitcoin** | `3PeEqA8UTvCuLwR1K5NKP8k11dFAh14rqM` |
| **USDC в сети Solana** | `6iWHFuvmBgZtUsyF3GmrF2Ng4tAPnBaEJkD8tr7Hm3cX` |

Имена поддержавших — на [jobees.org/#support](https://jobees.org/#support) (анонимный подарок остаётся
анонимным), а в [Discord](https://discord.gg/w5dtAMBVgZ) они получают роль Supporter. Помогли криптовалютой?
Создайте там тикет со ссылкой на транзакцию.

Начиная с 0.5.6 тот же код Ko-fi есть в приложении: **Настройки → О программе и благодарности → Поддержать разработку**:

<p align="center">
  <img src=".github/readme/ps5-support.webp" alt="Поддержка разработки в приложении: QR-код ko-fi.com/jvk3r" width="80%">
</p>

## Установка

Подробности — в **[руководстве по установке](INSTALLATION-GUIDE.md)** (на английском). Коротко:

1. Нужна **PS5 с джейлбрейком** и **ShadowMount+**.
2. Скопируйте `JobeesLair.exfat` в папку `homebrew` на USB-накопителе с exFAT (или в `/data/homebrew`).
3. Подключите накопитель. ShadowMount+ установит приложение. Откройте **Jobee'sLair** на главном экране.

> [!IMPORTANT]
> Телефон-компаньон просит выбрать PIN перед включением. Не используйте PIN, который применяете где-то
> ещё, и держите компаньон выключенным в общей или публичной сети.

## Нейтральность контента и уведомление DMCA

Jobee'sLair — инструмент загрузки, которым управляет пользователь, а не сервис контента.

- **Защищённые авторским правом файлы здесь не размещаются:** ни на сервере проекта, ни в репозитории, ни
  в образе приложения. Консоль скачивает файлы напрямую по сторонним адресам, которые выбираете вы.
- **Встроенный каталог** (`app/data/`) — это индекс названий, описаний, ссылок на обложки и сторонних
  адресов. Это не сами файлы, и проект не управляет этими серверами и не ручается за них.
- **Ваши фиды и зеркала — ваши.** Они загружаются и читаются на вашей консоли. У проекта нет сервера
  фидов, и он не видит, что вы добавляете и скачиваете.

**Чтобы сообщить о нарушающей права записи каталога, фиде или зеркале,** создайте
[обращение о нарушении](https://github.com/JVK3R/JobeesLair/issues/new?template=takedown.yml) или
воспользуйтесь [процедурой DMCA GitHub](https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy),
указав этот репозиторий. Укажите произведение и правообладателя, где находится запись (файл и title ID
либо точный адрес), свои контактные данные, заявление о добросовестном убеждении, что использование не
разрешено, и заявление под страхом наказания за лжесвидетельство о точности уведомления и о том, что вы
правообладатель или его представитель. Полное уведомление рассматривается оперативно, указанные записи
удаляются в следующем выпуске. Фид на чужом сервере вне контроля проекта: направьте уведомление и его
владельцу. Встречное уведомление рассматривается в порядке, предусмотренном DMCA и GitHub.

Это уведомление не является юридической консультацией и не меняет [LICENSE](LICENSE).

## Сборка

На Linux (или WSL) с `clang-18`, `llvm-18`, `cmake`, `ninja-build`, `nodejs`, `npm`, `zlib1g-dev`,
`build-essential`, `pkg-config`, `unzip`, `curl`, `exfatprogs` и Pillow (`ps5-react/requirements.txt`):

```sh
cd ps5-react
python3 tools/build_ps5.py --app-dir ../app --llvm /usr/bin
cp -a dist/PPSA99471 ../stage
../packaging/stage-docs.sh ../stage
sudo ../packaging/make-exfat.sh ../stage ../JobeesLair.exfat JOBEESLAIR
```

Тесты требуют только Node.js 22+: `npm test` (логика), `npm run test:render` (экраны), `npm run test:all`.

## Благодарности

- **JVK3R**, автор Jobee'sLair
- **drakmor** ([ShadowMount+](https://github.com/drakmor/ShadowMountPlus))
- **nexgen999** ([PS5 Repository List](https://github.com/nexgen999/PS5-Repository-List)): список раздела
  Homebrew берётся оттуда, с разрешения автора, и растёт вместе с ним
- **Все разработчики homebrew**, чьи проекты есть в разделе Homebrew
- **PS5 React — created by half144 and PS5 React contributors.**
  Исходный репозиторий исчез; фреймворк продолжается на
  [github.com/JVK3R/ps5-react](https://github.com/JVK3R/ps5-react), где живут изменения, сделанные для Jobee'sLair.
- **Nick** и **все тестировщики**: спасибо

Распространяется по GPL-3.0-or-later ([LICENSE](LICENSE)). Сторонние лицензии — в `notices/` внутри
приложения и в `ps5-react/docs/DEPENDENCIES.md`.
