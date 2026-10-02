import { scheduledCount, upcoming } from "./runtime.js";
/** @import { Dictionary } from "../index" */
/** @type {Dictionary} */
export default {
  Due: "Зараз",
  "column|Due": "Відправлення",
  "{minutes} min": "{minutes} хв",
  Today: "Сьогодні",
  Tomorrow: "Завтра",
  "on time": "вчасно",
  "{minutes} min late": "затримка {minutes} хв",
  "{minutes} min early": "на {minutes} хв раніше",
  Scheduled: "За розкладом",
  Live: "Актуально",
  "Live data · {minutes} min old": "Актуальні дані · {minutes} хв тому",
  "Live data · 1 min old": "Актуальні дані · 1 хв тому",
  "just now": "щойно",
  "1 min ago": "1 хв тому",
  "{minutes} min ago": "{minutes} хв тому",
  "Bus is at the stop": "Автобус на зупинці",
  "Last bus position ≈{distance} from stop · {minutes} min old":
    "Остання позиція автобуса ≈{distance} від зупинки · {minutes} хв тому",
  "Bus at or near stop": "Автобус на зупинці або поруч",
  "Bus nearby · ≈{distance} from stop": "Автобус поруч · ≈{distance} від зупинки",
  "Bus ≈{distance} from stop": "Автобус ≈{distance} від зупинки",
  "Waterbus is at the stop": "Водний автобус біля причалу",
  "Last waterbus position ≈{distance} from stop · {minutes} min old":
    "Остання позиція водного автобуса ≈{distance} від причалу · {minutes} хв тому",
  "Waterbus at or near stop": "Водний автобус біля причалу або поруч",
  "Waterbus nearby · ≈{distance} from stop":
    "Водний автобус поруч · ≈{distance} від причалу",
  "Waterbus ≈{distance} from stop": "Водний автобус ≈{distance} від причалу",
  "Wheelchair accessible": "Доступно для крісла колісного",
  "Not wheelchair accessible": "Недоступно для крісла колісного",
  "Not accessible": "Недоступно",
  "Loading…": "Завантаження…",
  "Save {name} to favourites": "Додати {name} до обраного",
  "Remove favourite": "Прибрати з обраного",
  "Save favourite": "Додати до обраного",
  "Updated {time}": "Оновлено {time}",
  "Refreshing…": "Оновлення…",
  Refresh: "Оновити",
  "Departure data summary": "Підсумок даних про відправлення",
  "{count} upcoming": upcoming,
  "Filter lines": "Фільтр маршрутів",
  "Only line {line}": "Лише маршрут {line}",
  "Only lines {lines}": "Лише маршрути {lines}",
  "Show only these lines": "Показувати лише ці маршрути",
  "All lines": "Усі маршрути",
  "Föli has no stop {id}.": "У Föli немає зупинки {id}.",
  "Check the number, or search by the stop’s name.":
    "Перевірте номер або знайдіть зупинку за назвою.",
  "Checking the timetable for line {line}…":
    "Перевіряємо розклад маршруту {line}…",
  "Checking the timetable for lines {lines}…":
    "Перевіряємо розклад маршрутів {lines}…",
  "Line {line} is not in Föli’s live times right now.":
    "Маршрут {line} зараз не відображається в актуальних даних Föli.",
  "Lines {lines} are not in Föli’s live times right now.":
    "Маршрути {lines} зараз не відображаються в актуальних даних Föli.",
  "Its timetable could not be checked either, so buses may still run.":
    "Розклад також не вдалося перевірити, тому автобуси все ще можуть курсувати.",
  "No departures on line {line} from this stop in the next 36 hours.":
    "У найближчі 36 годин з цієї зупинки немає рейсів маршруту {line}.",
  "No departures on lines {lines} from this stop in the next 36 hours.":
    "У найближчі 36 годин з цієї зупинки немає рейсів маршрутів {lines}.",
  "Other lines are leaving from this stop.": "З цієї зупинки відправляються інші маршрути.",
  "Show all lines": "Показати всі маршрути",
  live: "актуально",
  "{count} scheduled": scheduledCount,
  "Live update failed": "Не вдалося оновити актуальні дані",
  "Offline · last updated {time}": "Без мережі · останнє оновлення {time}",
  "Last live estimate": "Остання актуальна оцінка",
  "Live times may be out of date": "Актуальні часи можуть бути застарілими",
  "last successful update {age}": "останнє успішне оновлення {age}",
  "Live times aren’t available · showing the timetable.":
    "Актуальні часи недоступні · показуємо розклад.",
  "No live times right now · showing the timetable.":
    "Зараз немає актуальних часів · показуємо розклад.",
  "Later departures could not be checked, so more buses may run after these.":
    "Пізніші відправлення не вдалося перевірити, тому після показаних можуть бути ще рейси.",
  "Connecting to Föli": "З’єднання з Föli",
  "Loading departures…": "Завантаження відправлень…",
  "Couldn’t load departures.": "Не вдалося завантажити відправлення.",
  "Föli’s live times aren’t loading right now. Try again in a moment.":
    "Актуальні часи Föli зараз не завантажуються. Спробуйте ще раз трохи пізніше.",
  "Try again": "Спробувати ще раз",
  "No live departures right now.": "Зараз немає актуальних відправлень.",
  "The timetable could not be checked just now, so later buses may still run.":
    "Розклад зараз не вдалося перевірити, тому пізніші автобуси все ще можуть курсувати.",
  Updating: "Оновлення",
  "Checking for the next departures…": "Перевіряємо наступні відправлення…",
  "No upcoming departures.": "Немає найближчих відправлень.",
  "Try refreshing or choosing another nearby stop.":
    "Спробуйте оновити або вибрати іншу зупинку поруч.",
  Line: "Маршрут",
  Destination: "Напрямок",
  "Unknown destination": "Напрямок невідомий",
  "Cancelled at this stop · was due {time}":
    "Скасовано на цій зупинці · мало бути {time}",
  "Alert on": "Сповіщення увімкнено",
  "Get-off alert": "Сповіщення про вихід",
  Cancelled: "Скасовано",
  "About live estimates": "Про актуальні оцінки",
  "Live times are Föli’s estimates from the buses themselves. A bus’s distance is a straight line from its last reported position. Scheduled means Föli has no live data for that trip right now.":
    "Актуальні часи — це оцінки Föli, отримані від самих автобусів. Відстань до автобуса — це пряма від його останньої переданої позиції. «За розкладом» означає, що Föli зараз не має актуальних даних для цього рейсу.",
  "Hide stops": "Сховати зупинки",
  "Next stops": "Наступні зупинки",
  "short|Next stops": "Наступні",
  "Next stops · timetable times": "Наступні зупинки · часи за розкладом",
  "Loading planned stops…": "Завантаження запланованих зупинок…",
  "Next stops are temporarily unavailable.": "Наступні зупинки тимчасово недоступні.",
  "No later stops are listed.": "Подальших зупинок не вказано.",
  "around {time}": "близько {time}",
  planned: "за планом",
  "no drop-off": "вихід заборонено",
  "+{count} more · final stop": "+ще {count} · кінцева зупинка",
  "Trips to {destination} are shown first. Other departures stay below.":
    "Рейси до {destination} показані першими. Інші відправлення залишаються нижче.",
  "Other direction for {destination}": "Інший напрямок для {destination}",
  "Your bus": "Ваш автобус",
};
