import { options, transfers } from "./runtime.js";
/** @import { Dictionary } from "../index" */
/** @type {Dictionary} */
export default {
  "Location access is blocked. Allow location for this site in your browser settings and try again.":
    "Доступ до місцезнаходження заблоковано. Дозвольте його для цього сайту в налаштуваннях браузера й спробуйте знову.",
  "Your device could not determine its location. Check location services and try again.":
    "Пристрій не зміг визначити місцезнаходження. Перевірте служби геолокації й спробуйте знову.",
  "Location took too long to respond. Move near a window or try again.":
    "Визначення місцезнаходження триває надто довго. Підійдіть до вікна або спробуйте знову.",
  "Your location could not be read. Try again or choose a stop manually.":
    "Не вдалося прочитати ваше місцезнаходження. Спробуйте знову або виберіть зупинку вручну.",
  "This browser does not support location access.": "Цей браузер не підтримує доступ до місцезнаходження.",
  "Your location is too approximate{accuracy} to pick a stop for you. Search by name, or try again outdoors.":
    "Ваше місцезнаходження надто неточне{accuracy}, щоб автоматично вибрати зупинку. Знайдіть її за назвою або спробуйте знову надворі.",
  "You appear to be outside the Föli area, so no stop was filled in. Search by name instead.":
    "Схоже, ви поза зоною Föli, тому зупинку не вибрано. Знайдіть її за назвою.",
  "The nearest stop is {distance} away, so it was not filled in. Search by name instead.":
    "Найближча зупинка за {distance}, тому її не вибрано автоматично. Знайдіть потрібну за назвою.",
  "Two stops are almost equally close. Search for the one that serves your direction.":
    "Дві зупинки майже однаково близько. Знайдіть ту, що обслуговує ваш напрямок.",
  "No nearby Föli stop could be resolved from your location. Search manually instead.":
    "За вашим місцезнаходженням не вдалося визначити зупинку Föli поруч. Знайдіть її вручну.",
  "More than one stop has this name. Choose the correct stop number from the suggestions.":
    "Таку назву мають кілька зупинок. Виберіть правильний номер зі списку.",
  "Choose a stop from the suggestions or enter its stop number.":
    "Виберіть зупинку зі списку або введіть її номер.",
  "Stop locations are still loading. Try again in a moment.":
    "Координати зупинок ще завантажуються. Спробуйте за мить.",
  "Stop locations are temporarily unavailable. Search manually instead.":
    "Координати зупинок тимчасово недоступні. Знайдіть зупинку вручну.",
  "Find your stop": "Знайдіть свою зупинку",
  "e.g. Kauppatori": "напр. Kauppatori",
  "Use my location": "Використати моє місцезнаходження",
  "Find nearest stop": "Знайти найближчу зупинку",
  "Show departures": "Показати відправлення",
  Show: "Показати",
  "Matching bus stops": "Зупинки, що відповідають пошуку",
  "Search by stop name or number.": "Шукайте за назвою або номером зупинки.",
  "Open {name}, stop {id}": "Відкрити {name}, зупинка {id}",
  "Saved and recent stops": "Збережені й нещодавні зупинки",
  Favourites: "Обране",
  Recent: "Нещодавні",
  "{name}, stop {id}, {distance} away": "{name}, зупинка {id}, за {distance}",
  Nearest: "Найближча",
  "Walk there: {name}, stop {id}, in Google Maps":
    "Прокласти пішки: {name}, зупинка {id}, у Google Maps",
  "Walk there": "Прокласти пішки",
  "Nearby-stop data is still loading. Try again in a moment.":
    "Дані про зупинки поруч ще завантажуються. Спробуйте за мить.",
  "Stop locations are temporarily unavailable. Search for your stop by name, and try again later.":
    "Координати зупинок тимчасово недоступні. Знайдіть зупинку за назвою й спробуйте пізніше.",
  "Your location is approximate, so compare the nearby options before choosing.":
    "Ваше місцезнаходження визначено приблизно, тому порівняйте варіанти поруч перед вибором.",
  "Your location appears outside Föli’s published service area. Nearby stops are shown for reference, but none was selected automatically.":
    "Схоже, ви поза опублікованою зоною обслуговування Föli. Зупинки поруч показані для довідки, але жодну не вибрано автоматично.",
  "The nearest Föli stop is {distance} away. You may be outside the Föli service area.":
    "Найближча зупинка Föli за {distance}. Можливо, ви поза зоною обслуговування Föli.",
  "The nearest Föli stop is {distance} away, so it was not selected automatically. Choose the stop that fits your journey.":
    "Найближча зупинка Föli за {distance}, тому її не вибрано автоматично. Виберіть зупинку, яка підходить для вашої поїздки.",
  "Two stops are almost equally close. Choose the stop that serves your travel direction.":
    "Дві зупинки майже однаково близько. Виберіть ту, що обслуговує ваш напрямок.",
  "Near you": "Поруч із вами",
  "Uses your location once. It isn’t saved.": "Використовує ваше місцезнаходження один раз. Воно не зберігається.",
  "Locating…": "Визначаємо місцезнаходження…",
  "Update location": "Оновити місцезнаходження",
  "Getting stop locations…": "Завантажуємо координати зупинок…",
  "Location search is temporarily unavailable; stop search still works normally.":
    "Пошук за місцезнаходженням тимчасово недоступний; звичайний пошук зупинок працює.",
  "One-time location only": "Місцезнаходження лише один раз",
  "Accuracy ±{accuracy}": "Точність ±{accuracy}",
  "Selected stop ≈ {distance} away": "Вибрана зупинка ≈ {distance} звідси",
  "Nearest Föli stops": "Найближчі зупинки Föli",
  "Distances are approximate straight-line distances. “Walk there” opens an external walking route in Google Maps.":
    "Відстані приблизні й виміряні по прямій. «Прокласти пішки» відкриває зовнішній пішохідний маршрут у Google Maps.",
  "Distances are approximate straight-line distances. Walking route links return when you’re online.":
    "Відстані приблизні й виміряні по прямій. Посилання на пішохідні маршрути знову працюватимуть після відновлення мережі.",
  Journey: "Маршрут",
  "Where do you want to go?": "Куди ви хочете поїхати?",
  "Clear destination": "Очистити пункт призначення",
  "Going to": "Прямуємо до",
  "Journey destination": "Пункт призначення",
  Change: "Змінити",
  Clear: "Очистити",
  "Saved destinations": "Збережені пункти призначення",
  "Nearby stops for {destination}": "Зупинки поруч для {destination}",
  "Choose the best fit or switch back to pure distance.":
    "Виберіть найкращий варіант або поверніться до сортування лише за відстанню.",
  "Nearby stop sorting": "Сортування зупинок поруч",
  "Best for {destination}": "Найкраще для {destination}",
  "Checking routes…": "Перевіряємо маршрути…",
  "Checking which buses go to {destination}…": "Перевіряємо, які автобуси їдуть до {destination}…",
  "Goes to {destination}": "Їде до {destination}",
  "Timing may be tight": "Часу може бути мало",
  "Probably too late to catch": "Ймовірно, вже не встигнути",
  "Current buses go the other direction": "Поточні автобуси їдуть в іншому напрямку",
  "No direct option to {destination} is shown soon":
    "Найближчим часом не видно прямого варіанта до {destination}",
  "Departure check unavailable": "Перевірка відправлень недоступна",
  "Route suitability is uncertain": "Придатність маршруту невизначена",
  "Line {line}": "Маршрут {line}",
  "arrive about {time}": "прибуття близько {time}",
  Best: "Найкраще",
  "Nearby Föli stops for {destination}": "Зупинки Föli поруч для {destination}",
  "Direct options": "Прямі варіанти",
  "Best ways to {destination}": "Найкращі варіанти до {destination}",
  "1 option": "1 варіант",
  "{count} options": options,
  Fastest: "Найшвидше",
  "Less walking": "Менше пішки",
  "Easier to catch": "Легше встигнути",
  "Arrive about {time}": "Прибуття близько {time}",
  "from {stop}": "від {stop}",
  "to stop": "до зупинки",
  "{distance} less walking · about {minutes} min later":
    "на {distance} менше пішки · приблизно на {minutes} хв пізніше",
  "{distance} less walking": "на {distance} менше пішки",
  "More time to catch · about {minutes} min later":
    "Більше часу, щоб встигнути · приблизно на {minutes} хв пізніше",
  "More time to catch": "Більше часу, щоб встигнути",
  "Earliest arrival we found": "Найраніше знайдене прибуття",
  "Live estimate": "Актуальна оцінка",
  "Timetable estimate": "Оцінка за розкладом",
  "Realtime uncertain": "Актуальні дані невизначені",
  Estimate: "Оцінка",
  "Direct options use current Föli data and approximate straight-line distance to the boarding stop.":
    "Прямі варіанти використовують поточні дані Föli та приблизну відстань по прямій до зупинки посадки.",
  "Checking a little farther…": "Перевіряємо трохи далі…",
  "Checked {count} nearby stops": "Перевірено {count} зупинок поруч",
  "Active journey": "Активна поїздка",
  "Choose another route": "Вибрати інший маршрут",
  "Wait for line {line}": "Чекайте маршрут {line}",
  "Walk to {stop}": "Ідіть до {stop}",
  "Stay at {stop}": "Залишайтеся на {stop}",
  "Stay here for line {line}.": "Залишайтеся тут і чекайте маршрут {line}.",
  "Walk about {distance} to {stop} for line {line}.":
    "Пройдіть близько {distance} до {stop} для маршруту {line}.",
  "You are at the transfer stop. Confirm it below before waiting for the next bus.":
    "Ви на зупинці пересадки. Підтвердьте це нижче перед очікуванням наступного автобуса.",
  "When you reach the transfer stop, confirm it here. The app will not assume your physical location.":
    "Коли дістанетеся зупинки пересадки, підтвердьте це тут. Застосунок не припускатиме ваше фізичне місцезнаходження.",
  "Wait here for line {line}.": "Чекайте тут маршрут {line}.",
  "When line {line} arrives, open the selected departure and start the Get-off alert.":
    "Коли прибуде маршрут {line}, відкрийте вибране відправлення й увімкніть сповіщення про вихід.",
  "Show line {line} departure": "Показати відправлення маршруту {line}",
  "To {destination}": "До {destination}",
  "Leaves {due}": "Відправлення {due}",
  "About {distance} to the boarding stop.": "Близько {distance} до зупинки посадки.",
  "When you reach the stop, confirm it here. The app will not assume your physical location.":
    "Коли дістанетеся зупинки, підтвердьте це тут. Застосунок не припускатиме ваше фізичне місцезнаходження.",
  "Your selected bus is pinned first in the departure board.":
    "Вибраний автобус закріплено першим на табло відправлень.",
  "When you board, use Get-off alert on that departure. Ride Mode remains in control after that.":
    "Після посадки ввімкніть «Сповіщення про вихід» для цього рейсу. Далі режим поїздки залишається головним.",
  "Your selected bus was cancelled.": "Вибраний автобус скасовано.",
  "Your selected bus is no longer a reliable option.": "Вибраний автобус більше не є надійним варіантом.",
  "Offline: this selected plan may be out of date.": "Без мережі: вибраний план може бути застарілим.",
  "Live monitoring is paused while another stop is open. Return to the selected stop to resume it.":
    "Актуальний моніторинг призупинено, поки відкрита інша зупинка. Поверніться до вибраної зупинки, щоб продовжити.",
  "Live monitoring is temporarily unavailable. The selected departure may be out of date.":
    "Актуальний моніторинг тимчасово недоступний. Дані вибраного відправлення можуть бути застарілими.",
  "Return to selected stop": "Повернутися до вибраної зупинки",
  "I'm at the stop": "Я на зупинці",
  "Show selected departure": "Показати вибране відправлення",
  "Find another option": "Знайти інший варіант",
  "View selected stop": "Переглянути вибрану зупинку",
  "Stop, address or place": "Зупинка, адреса або місце",
  "e.g. Prisma Itäharju or Kauppatori": "напр. Prisma Itäharju або Kauppatori",
  "Searching…": "Пошук…",
  "Search destination": "Шукати пункт призначення",
  "Choose Home, Work, School, a Föli stop, address or place.":
    "Виберіть Дім, Роботу, Школу, зупинку Föli, адресу або місце.",
  "Destination suggestions":
    "Підказки пункту призначення",
  "Stop or place":
    "Зупинка або місце",
  "e.g. Kauppatori or Prisma":
    "напр. Kauppatori або Prisma",
  "Choose Home, Work, School, a Föli stop or a place such as Prisma.":
    "Виберіть Дім, Роботу, Школу, зупинку Föli або місце, як-от Prisma.",
  "Street addresses aren’t searched here. For an address, use the official Turku journey planner.":
    "Адреси тут не шукаються. Щоб знайти адресу, скористайтеся офіційним планувальником маршрутів Турку.",
  "No stop or place matches “{query}”. For a street address, use the official Turku journey planner.":
    "За запитом «{query}» немає ні зупинки, ні місця. Щоб знайти адресу, скористайтеся офіційним планувальником маршрутів Турку.",
  "Nearest to me first":
    "Спершу найближчі до мене",
  "Stop suggestions stay on this device. Place/address text is sent to OpenStreetMap only after you press Search; repeated searches are cached only for this browser session.":
    "Підказки зупинок залишаються на цьому пристрої. Текст місця/адреси надсилається до OpenStreetMap лише після натискання «Шукати»; повторні пошуки кешуються тільки в цій сесії браузера.",
  "Places & addresses": "Місця й адреси",
  "Choose one": "Виберіть один варіант",
  "Place search data": "Дані пошуку місць",
  "© OpenStreetMap contributors": "© Учасники OpenStreetMap",
  "Place search is temporarily unavailable. Föli stop search still works.":
    "Пошук місць тимчасово недоступний. Пошук зупинок Föli продовжує працювати.",
  "Open Turku journey planner": "Відкрити планувальник маршрутів Турку",
  "Journey timing and preference": "Час поїздки та пріоритет",
  When: "Коли",
  "Leave now": "Вирушити зараз",
  "Leave at": "Вирушити о",
  "Arrive by": "Прибути до",
  "Turku local time": "Місцевий час Турку",
  "Route preference": "Пріоритет маршруту",
  Balanced: "Збалансовано",
  "Fewer transfers": "Менше пересадок",
  "More transfer time": "Більше часу на пересадку",
  "Future-time searches use published Föli timetables. Live estimates are used for leave-now journeys when fresh.":
    "Пошук на майбутній час використовує опубліковані розклади Föli. Для поїздок «зараз» використовуються свіжі актуальні оцінки.",
  "Choose a valid future Turku time. Times skipped by the daylight-saving clock change are not available.":
    "Виберіть коректний майбутній час Турку. Часи, яких немає під час переходу на літній час, недоступні.",
  "Latest departure": "Найпізніше відправлення",
  "Latest departure we found that meets your arrival time":
    "Найпізніше знайдене відправлення, яке вкладається у ваш час прибуття",
  "Fresh transfer options": "Свіжі варіанти пересадки",
  "Continue to {destination}": "Продовжити до {destination}",
  "Checking fresh buses from this transfer area…": "Перевіряємо свіжі автобуси з цієї зони пересадки…",
  "Recovery search will resume when you’re online.": "Пошук нового маршруту продовжиться після відновлення мережі.",
  "Recovery search is temporarily unavailable. Your destination is kept.":
    "Пошук нового маршруту тимчасово недоступний. Пункт призначення збережено.",
  "No reliable replacement with at most one new transfer is available from this transfer area right now.":
    "Зараз із цієї зони пересадки немає надійного альтернативного маршруту максимум з однією новою пересадкою.",
  "These options start from the transfer area. Your journey changes only after you choose one.":
    "Ці варіанти починаються із зони пересадки. Ваша поїздка зміниться лише після явного вибору.",
  "The failed bus is excluded. Nothing changes until you choose a new option.":
    "Проблемний автобус виключено. Нічого не зміниться, доки ви не виберете новий варіант.",
  "No direct trip found nearby. Checking options with up to two transfers…":
    "Прямого маршруту поруч не знайдено. Перевіряємо варіанти максимум із двома пересадками…",
  "No reliable option with up to two transfers was found from the nearby stops.":
    "Із зупинок поруч не знайдено надійного варіанта максимум із двома пересадками.",
  "Transfer search is temporarily unavailable. Nearby stops remain available.":
    "Пошук пересадок тимчасово недоступний. Зупинки поруч залишаються доступними.",
  "Transfer options": "Варіанти з пересадкою",
  "Ways to {destination} with one change": "Маршрути до {destination} з однією пересадкою",
  "Continue to {destination} with a new connection": "Продовжити до {destination} новим маршрутом",
  "Ways to {destination} with up to two changes":
    "Маршрути до {destination} максимум із двома пересадками",
  "1 transfer": "1 пересадка",
  "{count} transfers": transfers,
  "Change {number}: {stop} · same stop": "Пересадка {number}: {stop} · та сама зупинка",
  "Change {number}: {stop} · walk ≈ {distance}":
    "Пересадка {number}: {stop} · пішки ≈ {distance}",
  "total walking ≈ {distance}": "усього пішки ≈ {distance}",
  "to first stop": "до першої зупинки",
  "Comfortable transfer": "Комфортний запас на пересадку",
  "Reasonable transfer": "Достатній запас на пересадку",
  "Tight transfer": "Мало часу на пересадку",
  "about {minutes} min transfer margin": "запас на пересадку близько {minutes} хв",
  "Future buses are rechecked against fresh live data. The app keeps each committed leg explicit and never silently switches you to another journey.":
    "Майбутні автобуси повторно перевіряються за свіжими актуальними даними. Застосунок явно зберігає кожну вибрану ділянку й ніколи непомітно не перемикає вас на іншу поїздку.",
  "This replacement starts from the transfer area. Nothing changes until you choose it.":
    "Цей альтернативний маршрут починається із зони пересадки. Нічого не зміниться, доки ви його не виберете.",
  "Leg {current} of {total} · change at {stop} to line {line}":
    "Ділянка {current} з {total} · на {stop} пересядьте на маршрут {line}",
  "Leg {current} of {total} · continue on line {line}":
    "Ділянка {current} з {total} · продовжуйте маршрутом {line}",
  "A committed future bus was cancelled. Choose a fresh option.":
    "Один із вибраних майбутніх автобусів скасовано. Виберіть свіжий варіант.",
  "A committed future bus has probably been missed. Choose a fresh option.":
    "Один із вибраних майбутніх автобусів, імовірно, вже пропущено. Виберіть свіжий варіант.",
  "When you board, start the Get-off alert for this leg. Ride Mode stays in control until you get off, then Journey Assistant resumes with the next leg.":
    "Після посадки ввімкніть сповіщення про вихід для цієї ділянки. Режим поїздки залишається головним до виходу, після чого Помічник маршруту продовжить із наступної ділянки.",
  "Your second bus was cancelled. Choose a fresh option.":
    "Ваш другий автобус скасовано. Виберіть свіжий варіант.",
  "Live check: line {line} still looks catchable.":
    "Актуальна перевірка: на маршрут {line} усе ще, схоже, можна встигнути.",
  "Live check: line {line} still looks catchable · about {minutes} min transfer margin.":
    "Актуальна перевірка: на маршрут {line} усе ще, схоже, можна встигнути · запас близько {minutes} хв.",
  "Live check: the transfer to line {line} is tight.":
    "Актуальна перевірка: на пересадку на маршрут {line} мало часу.",
  "Live check: the transfer to line {line} is tight · about {minutes} min margin.":
    "Актуальна перевірка: на пересадку на маршрут {line} мало часу · запас близько {minutes} хв.",
  "Live check: the transfer to line {line} is tight · less than 1 min margin.":
    "Актуальна перевірка: на пересадку на маршрут {line} мало часу · запас менше 1 хв.",
  "Live check for line {line} is uncertain. Keeping the selected connection until stronger evidence.":
    "Актуальна перевірка маршруту {line} невизначена. Зберігаємо вибрану пересадку, доки не буде сильнішого підтвердження.",
  "The second bus has probably been missed. Choose a fresh option.":
    "Другий автобус, імовірно, вже пропущено. Виберіть свіжий варіант.",
  "The selected transfer can no longer be continued safely. Choose a fresh option.":
    "Вибрану пересадку більше не можна надійно продовжити. Виберіть свіжий варіант.",
  "When you board, start the Get-off alert for the selected transfer stop. Ride Mode stays in control until you get off, then Journey Assistant resumes with leg 2.":
    "Після посадки ввімкніть сповіщення про вихід для вибраної зупинки пересадки. Режим поїздки залишається головним до виходу, після чого Помічник маршруту продовжить із ділянки 2.",
  "Enter a stop, address or place.": "Введіть зупинку, адресу або місце.",
  "Enter a stop or place.": "Введіть зупинку або місце.",
  "Place search needs a connection. You can still choose a Föli stop from the suggestions.":
    "Пошук місць потребує мережі. Ви все одно можете вибрати зупинку Föli з підказок.",
  "Place search needs a connection. Search by Föli stop name or number while offline.":
    "Пошук місць потребує мережі. Без мережі шукайте зупинку Föli за назвою або номером.",
  "Enter at least 3 characters to search places and addresses.":
    "Введіть щонайменше 3 символи для пошуку місць і адрес.",
  "No matching place or address was found. You can still choose a Föli stop from the suggestions.":
    "Відповідного місця чи адреси не знайдено. Ви все одно можете вибрати зупинку Föli з підказок.",
  "No matching stop, place or address was found. Try a more specific destination.":
    "Відповідної зупинки, місця чи адреси не знайдено. Спробуйте точніше вказати пункт призначення.",
  "No Föli stop close enough to this place could be resolved. Try another destination.":
    "Поблизу цього місця не вдалося визначити достатньо близьку зупинку Föli. Спробуйте інший пункт призначення.",
  "Reach destination about {time}": "Дістатися пункту призначення близько {time}",
  "final walk ≈ {distance}": "фінальна піша ділянка ≈ {distance}",
  "Arrival includes an approximate final walk based on straight-line distance; the real walking route can be longer.":
    "Час прибуття містить приблизну фінальну пішу ділянку за відстанню по прямій; реальний шлях може бути довшим.",
  "Live transit + approximate walk": "Актуальний транспорт + приблизна піша ділянка",
  "Timetable + approximate walk": "Розклад + приблизна піша ділянка",
  "Realtime uncertain + approximate walk": "Актуальні дані невизначені + приблизна піша ділянка",
  "Transit + approximate walk": "Транспорт + приблизна піша ділянка",
  "Final walk is approximate straight-line based guidance. The real walking route can be longer.":
    "Фінальна піша ділянка — приблизна оцінка за відстанню по прямій. Реальний шлях може бути довшим.",
  "This place appears outside Föli’s service area. Choose a destination inside the Föli area.":
    "Це місце, схоже, поза зоною обслуговування Föli. Виберіть пункт призначення в зоні Föli.",
  "Place search is temporarily rate-limited. Wait a moment and try again; Föli stop search still works.":
    "Пошук місць тимчасово обмежено. Зачекайте трохи й спробуйте знову; пошук зупинок Föli продовжує працювати.",
  "Final walk": "Фінальна піша ділянка",
  "Walk to {destination}": "Ідіть пішки до {destination}",
  "Walking distance is approximate straight-line guidance. The real walking route can be longer.":
    "Піша відстань — приблизна оцінка по прямій. Реальний маршрут може бути довшим.",
  "Walking link unavailable offline.": "Посилання на пішохідний маршрут недоступне без мережі.",
  Done: "Готово",
};
