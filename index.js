const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const bot = new TelegramBot(process.env.CALENDAR_BOT, { polling: true });
const data = require("sqlite-sync");
data.connect("database/calendar.db");
const functions = require("./db_worker");
if (typeof require !== "undefined") XLSX = require("xlsx");
var registration = {},
  reminder = [];

bot.onText(/\/start/, async (msg) => {
  if (
    !data.run("select count (*) as cnt from users where user_id = ?", [
      msg.chat.id,
    ])[0].cnt
  ) {
    bot.sendMessage(
      msg.chat.id,
      data.run('select * from phrases where keyword = "greeting"')[0].content,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }
    );
    functions.register(msg, bot);
    registration[msg.chat.id] = {
      eduprog: true,
      course: false,
    };
  } else {
    bot.sendMessage(
      msg.chat.id,
      data.run('select * from phrases where keyword = "menu"')[0].content,
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: menu_keyboard(null, msg.chat.id) },
      }
    );
  }
});

bot.on("message", (msg) => {
  if (msg.new_chat_members || msg.left_chat_member) return;
  functions.adminPanel(msg, bot);
  if (msg.entities && msg.entities[0].type == "bot_command") return;
  if (msg.from.id == msg.chat.id) sendAskAndAnswer(msg);
});

bot.on("callback_query", (query) => {
  functions.updateStatistics(query);
  if (functions.adminPanel(query, bot) != "end") return;
  let user = new User(query.message.chat.id);
  let keyboard = menu_keyboard(query.data, user.user_id);
  if (user.user_id in registration) {
    if (registration[user.user_id].group) {
      data.update(
        "users",
        { group_number: +query.data },
        { user_id: user.user_id }
      );
      settingsMessage(query);
      registration[user.user_id].group = false;
    }
    if (registration[user.user_id].course) {
      data.update("users", { course: +query.data }, { user_id: user.user_id });
      let groupsKeyboard = [[]];
      let sheet = new Sheet(user.eduprog);
      for (
        let i = 0;
        i < sheet.groups(sheet.courseColumn(course(+query.data))).length - 1;
        i++
      ) {
        groupsKeyboard[0].push({
          text: i + 1 + " група",
          callback_data: i + 1,
        });
      }
      bot.editMessageText(
        "Обрано " + query.data + " курс. Оберіть групу із доступних:",
        {
          parse_mode: "HTML",
          chat_id: user.user_id,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: groupsKeyboard },
        }
      );
      registration[user.user_id].course = false;
      registration[user.user_id].group = true;
    }
    if (registration[user.user_id].eduprog) {
      var text = "",
        eduprogs = data.run("select * from eduprogs");
      for (let i = 0; i < eduprogs.length; i++) {
        eduprogs[i] = eduprogs[i].query;
      }
      if (eduprogs.includes(query.data)) {
        data.update(
          "users",
          { eduprog: query.data },
          { user_id: user.user_id }
        );
        text =
          'Обрано освітню програму <i>"' +
          data.run("select name from eduprogs where query = ?", [query.data])[0]
            .name;
      }
      bot.editMessageText(text + '"</i>\nОбери курс', {
        parse_mode: "HTML",
        chat_id: user.user_id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "1", callback_data: 1 },
              { text: "2", callback_data: 2 },
              { text: "3", callback_data: 3 },
              { text: "4", callback_data: 4 },
            ],
            [
              { text: "1 магістр", callback_data: 5 },
              { text: "2 магістр", callback_data: 6 },
            ],
          ],
        },
      });
      registration[user.user_id].eduprog = false;
      registration[user.user_id].course = true;
    }
  }

  if (query.data == "notify")
    data.update("users", { notifications: 1 }, { user_id: user.user_id });
  if (query.data == "notnotify")
    data.update("users", { notifications: 0 }, { user_id: user.user_id });

  if (
    data.run("select count (*) as cnt from admins where chat_id = ?", [
      user.user_id,
    ])[0].cnt
  ) {
    if (query.data == "Gnotify") startReminder();
    if (query.data == "Gnotnotify") stopReminder();
  }
  if (query.data.indexOf("notify") != -1 || query.data == "settings") {
    settingsMessage(query);
    return;
  }

  if (query.data.includes("register")) {
    functions.register(query, bot);
    registration[user.user_id] = {
      eduprog: true,
      course: false,
    };
  }

  if (query.data == "menu") {
    bot.editMessageText(
      data.run('select * from phrases where keyword = "menu"')[0].content,
      {
        chat_id: user.user_id,
        parse_mode: "HTML",
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    );
  }

  if (
    (user.eduprog == null || user.course == null) &&
    (query.data == "today" || query.data == "week")
  ) {
    var settings_button = data.run(
      "select * from menu_keyboard where callback_data = 'settings'"
    )[0];
    bot.editMessageText(
      "Для цього потрібно закінчити реєстрацію в налаштуваннях",
      {
        chat_id: user.user_id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: settings_button.text,
                callback_data: settings_button.callback_data,
              },
            ],
          ],
        },
        parse_mode: "HTML",
      }
    );
    return;
  }

  keyboard.unshift([
    {
      text: "Оновити",
      callback_data: query.data,
    },
  ]);
  if (query.data.includes("today")) {
    var day = new Date().getDay();
    if (query.data.includes(".")) day = query.data.split(".")[1];
    if (
      functions
        .getFiles("excelfiles")
        .includes(
          data.run("select * from users where user_id = ?", [user.user_id])[0]
            .eduprog
        )
    ) {
      var text =
        data.run("select name from eduprogs where query = ?", [user.eduprog])[0]
          .name +
        " " +
        course(user.course) +
        "\n" +
        getWeekDay(day) +
        ":\n" +
        oneDayText(day, user.eduprog, course(user.course));

      if (isTextEqual(text, query.message.text)) return;
      keyboard[0].unshift({
        text: "⬅️",
        callback_data: "today." + prevnextday(day)[0],
      });
      keyboard[0].push({
        text: "➡️",
        callback_data: "today." + prevnextday(day)[1],
      });
      bot.editMessageText(text, {
        chat_id: user.user_id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: keyboard,
        },
        disable_web_page_preview: true,
        parse_mode: "HTML",
      });
    } else {
      bot.sendMessage(user.user_id, "Розклад для Вашої ОП ще не завантажено");
    }
  }
  if (query.data == "week") {
    if (
      functions
        .getFiles("excelfiles")
        .includes(
          data.run("select * from users where user_id = ?", [user.user_id])[0]
            .eduprog
        )
    ) {
      var text =
        data.run("select name from eduprogs where query = ?", [user.eduprog])[0]
          .name +
        " " +
        course(user.course) +
        "\n";
      for (let i = 1; i < 6; i++) {
        text +=
          getWeekDay(i) +
          ":\n" +
          oneDayText(i, user.eduprog, course(user.course));
      }
      if (isTextEqual(text, query.message.text)) return;
      try {
        bot.editMessageText(text, {
          chat_id: user.user_id,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: keyboard,
          },
          disable_web_page_preview: true,
          parse_mode: "HTML",
        });
      } catch (error) {}
    } else {
      bot.sendMessage(user.user_id, "Розклад для Вашої ОП ще не завантажено");
    }
  }
});
function isDayEmpty(sheet, dayRow, courseColumn) {
  for (let j = dayRow; j < dayRow + sheet.dayRows(dayRow); j++) {
    if (sheet.cell(column(courseColumn) + j).toUpperCase() == "ДЕНЬ") {
      return true;
    }
  }
  return false;
}
function oneDayText(day, eduprog, course) {
  var text = "",
    sheet = new Sheet(eduprog),
    dayRow,
    courseColumn,
    groups;
  dayRow = sheet.dayRow(day);
  courseColumn = sheet.courseColumn(course);
  groups = sheet.groups(courseColumn);

  if (isDayEmpty(sheet, dayRow, courseColumn) || day == 0)
    return text + "<b>День самостійної роботи</b>\n\n";

  for (let j = dayRow; j < dayRow + sheet.dayRows(dayRow); j += 4) {
    let classes = "";
    for (i = 0; i < groups.length - 1; i++) {
      const lesson = oneLessonText(
        sheet,
        j,
        groups[i],
        groups[i + 1] - groups[i]
      );
      if (lesson) {
        if (
          lesson.indexOf("(л)") == -1 &&
          lesson.indexOf("Кластер") == -1 &&
          lesson.indexOf("Кл.") == -1
        )
          //do not add a group ID when a pair exists for a cluster or is a lecture
          classes += "<u><b>" + (i + 1) + "</b> група</u>\n";
        classes += lesson + "\n";
      }
    }
    if (classes) {
      text +=
        "<b><i>" +
        sheet.cell(column(2) + (j + 1)) +
        "</i></b>\n" +
        classes +
        "\n";
    }
  }
  return text;
}

function oneLessonText(sheet, row, col, numberOfColumns) {
  // number of columns - кількість колонок для однієї групи
  let text = "";
  let week = false;
  for (let j = col; j < col + numberOfColumns; j++) {
    if (
      (sheet
        .cell(column(j) + (row + 2))
        .charAt(0)
        .toUpperCase() == sheet.cell(column(j) + (row + 2)).charAt(0) &&
        sheet.cell(column(j) + (row + 2)) != "" &&
        sheet.cell(column(j) + row) != "" &&
        !sheet.cell(column(j) + (row + 2)).includes("ОНЛАЙН")) ||
      (sheet.cell(column(j) + (row + 2)) != "" &&
        sheet.cell(column(j) + row) == "" &&
        sheet.cell(column(j) + (row + 1)) == "") ||
      (sheet.cell(column(j) + row) != "" &&
        sheet.cell(column(j) + (row + 2)) == "" &&
        sheet.cell(column(j) + (row + 3)) == "")
    ) {
      week = true;
    }
    for (let i = 0; i <= 3; i++) {
      if (week && sheet.cell(column(j) + (row + i))) {
        if (i == 0) text += "1 тиждень \t\t\t";
        if (i == 2) text += "2 тиждень \t\t\t";
        text += "<i>";
        text += sheet.cell(column(j) + (row + i)) + " ";
        text += "</i>";
      } else if (sheet.cell(column(j) + (row + i))) {
        text += sheet.cell(column(j) + (row + i)) + " ";
      }
      if (
        i == 1 &&
        sheet.cell(column(j) + (row + 2)) &&
        sheet.cell(column(j) + row) &&
        week
      ) {
        text += "\n";
      }
    }
    week = false;
  }
  return text;
}

function menu_keyboard(callback_data, chatId) {
  let menu_keyboard = data.run("select * from menu_keyboard");
  var keyboard = [[]],
    row = 0;
  for (let index = 0; index < menu_keyboard.length; index++) {
    const keyb_button = menu_keyboard[index];
    if (index % 2 == 0) {
      row++;
      keyboard.push([]);
    }
    if (String(callback_data).includes(String(keyb_button.callback_data))) {
      continue;
    }
    if (
      !(
        getWeekDay(new Date().getDay()) == "Неділя" &&
        keyb_button.callback_data == "today"
      )
    ) {
    }
    keyboard[row].push({
      text: keyb_button.text,
      callback_data: keyb_button.callback_data,
    });
  }
  if (
    data.run(
      "select count(*) as cnt from admins where rank not null and rank <> 'moderator' and chat_id = ?",
      [chatId]
    )[0].cnt
  ) {
    keyboard.push(functions.adminPanelMenu[0]);
  }
  return keyboard;
}

function settingsMessage(query) {
  var notifications,
    Gnotifications,
    groups,
    user = new User(query.message.chat.id);

  user.notifications
    ? (notifications = "увімкнено")
    : (notifications = "вимкнено");
  user.eduprog
    ? (groups =
        new Sheet(user.eduprog).groups(
          new Sheet(user.eduprog).courseColumn(course(user.course))
        ).length - 1)
    : (groups = "?");
  var keyboard = {
      inline_keyboard: [
        [
          { text: "Змінити📝", callback_data: "register" },
          {
            text: user.notifications ? "🔕" : "🔔",
            callback_data: user.notifications ? "notnotify" : "notify",
          },
        ],
      ],
    },
    text =
      "Поточні налаштування\n\nОсвітня програма: <b>" +
      user.eduprog +
      "</b>\nКурс: <b>" +
      user.course +
      "</b>\nГрупа: <b>" +
      user.group +
      "</b>\n\nВсього груп: <b>" +
      groups +
      "</b>\n\n<i>Сповіщення про початок пари</i> <b>" +
      notifications +
      "</b>. Щоб змінити, натисність на кнопку з дзвіночком";
  if (
    data.run("select count (*) as cnt from admins where chat_id = ?", [
      user.user_id,
    ])[0].cnt
  ) {
    keyboard.inline_keyboard.push([
      {
        text: reminder.length ? "Для всіх 🔕" : " Для всіх 🔔",
        callback_data: reminder.length ? "Gnotnotify" : "Gnotify",
      },
    ]);
    reminder.length
      ? (Gnotifications = "увімкнено")
      : (Gnotifications = "вимкнено");
    text +=
      "\n\nСповіщення про початок пари для всіх користувачів: <b>" +
      Gnotifications +
      "</b>";
  } else {
    reminder.length
      ? (Gnotifications =
          "Нагадування про початок пари <b>буде надсилатись</b>, якщо така функція увімкнена у твоїх параметрах. 🙂")
      : (Gnotifications =
          "Адміністратор <b>вимкнув</b> нагадування про початок пари <i>для всіх користувачів</i>. Навіть якщо функція увімкнена в твоїх параметрах, ти все одно не отримаєш сповіщення 😔");
    text += "\n\n" + Gnotifications;
  }
  keyboard.inline_keyboard.push([
    { text: "Головне меню 🏠", callback_data: "menu" },
  ]);
  bot.editMessageText(text, {
    parse_mode: "HTML",
    message_id: query.message.message_id,
    chat_id: query.message.chat.id,
    reply_markup: keyboard,
  });
}

function getWeekDay(day) {
  let days = [
    "Неділя",
    "Понеділок",
    "Вівторок",
    "Середа",
    "Четвер",
    "П'ятниця",
    "Субота",
  ];
  return days[day];
}

function prevnextday(day) {
  if (day == 1) return [6, 2];
  if (day == 6) return [5, 1];
  return [+day - 1, +day + 1];
}

function course(course) {
  if (course > 4) return "магістратура - " + (course - 4) + " курс";
  return course + " курс";
}

function isTextEqual(newText, oldText) {
  var reg = [/\n+/g, /\s+/g, /<\/?[a-zA-Z]+>/gi];
  reg.forEach((element) => {
    newText = newText.replace(element, "");
    oldText = oldText.replace(element, "");
  });
  return newText == oldText;
}

function column(columnNumber) {
  let columnName = [];
  while (columnNumber > 0) {
    // Find remainder
    let rem = columnNumber % 26;
    // If remainder is 0, then a, z must be there in output
    if (rem == 0) {
      columnName.push("Z");
      columnNumber = Math.floor(columnNumber / 26) - 1;
    } else {
      columnName.push(String.fromCharCode(rem - 1 + "A".charCodeAt(0)));
      columnNumber = Math.floor(columnNumber / 26);
    }
  }
  return columnName.reverse().join("");
}

class Sheet {
  constructor(eduprog) {
    this.eduprog = eduprog;
    this.workbook = XLSX.readFile("excelfiles/" + this.eduprog + ".xlsx");
    this.worksheet = this.workbook.Sheets[this.workbook.SheetNames[0]];

    this.cell = function (coord) {
      return this.worksheet[coord] ? this.worksheet[coord].v : "";
    };
    this.courseColumn = function (course, i = 1) {
      for (i; true; i++) {
        if (this.cell(column(i) + "6") == course) {
          break;
        }
      }
      return i;
    };
    this.dayRow = function (day, i = 1) {
      for (i; true; i++) {
        if (this.cell("A" + i) == getWeekDay(day)) {
          break;
        }
      }
      return i;
    };
    this.courseColumns = function (courseColumn) {
      for (var i = courseColumn + 1; true; i++) {
        if (this.cell(column(i) + "6") != "") {
          break;
        }
      }
      return i - courseColumn;
    };
    this.dayRows = function (dayRow) {
      for (var i = dayRow + 1; true; i++) {
        if (this.cell("A" + i) != "") {
          break;
        }
      }
      return i - dayRow;
    };
    this.groups = function (courseColumn) {
      var groupColumns = [];
      if (this.cell(column(courseColumn) + "8") == "") {
        groupColumns.push(courseColumn);
        groupColumns.push(this.courseColumns(courseColumn) + courseColumn);
        return groupColumns;
      }

      for (
        var i = courseColumn;
        i < this.courseColumns(courseColumn) + courseColumn;
        i++
      ) {
        if (this.cell(column(i) + "8") != "") groupColumns.push(i);
      }
      groupColumns.push(this.courseColumns(courseColumn) + courseColumn);
      return groupColumns;
    };
    this.timeRow = function (dayRow, time) {
      for (var i = dayRow; true; i++) {
        const cell = this.cell("B" + i);
        if (cell != "") {
          if (
            (cell.indexOf("-") != -1 &&
              cell.slice(0, cell.indexOf("-")) == String(time)) ||
            (cell.indexOf("*") != -1 &&
              cell.slice(0, cell.indexOf("*")) == String(time))
          ) {
            break;
          }
        }
      }
      return i - 1;
    };
  }
}
class User {
  constructor(chatId) {
    this.user_id = chatId;
    var user = data.run("select * from users where user_id = ?", [
      this.user_id,
    ])[0];
    this.notifications = user.notifications;
    this.eduprog = user.eduprog;
    this.course = user.course;
    this.username = user.username ? user.username : "";
    this.first_name = user.first_name;
    this.group = user.group_number;
  }
}

function sendAskAndAnswer(msg) {
  let admins = data.run("select * from admins where rank not null");
  let current_admin = data.run(
    "select * from admins where rank not null and chat_id = ?",
    [msg.chat.id]
  );
  if (
    current_admin.length &&
    msg.reply_to_message &&
    (msg.reply_to_message.entities || msg.reply_to_message.caption_entities)
  ) {
    functions.malling(
      msg,
      msg.text ? msg.text : msg.caption ? msg.caption : "",
      msg.reply_to_message.entities
        ? msg.reply_to_message.entities[0].user.id
        : msg.reply_to_message.caption_entities
        ? msg.reply_to_message.caption_entities[0].user.id
        : NaN,
      bot
    );
    for (let i = 0; i < admins.length; i++) {
      const another_admin = admins[i];
      if (current_admin[0].chat_id == another_admin.chat_id) continue;
      functions.malling(
        msg,
        (msg.chat.first_name ? msg.chat.first_name : msg.chat.title) +
          " відповів " +
          (msg.reply_to_message.text
            ? msg.reply_to_message.entities[0].user.first_name
            : msg.reply_to_message.caption
            ? msg.reply_to_message.caption_entities[0].user.first_name
            : null) +
          ":\n" +
          (msg.text ? msg.text : msg.caption ? msg.caption : ""),
        another_admin.chat_id,
        bot
      );
    }
    return;
  }
  if (msg.chat.id == msg.from.id && !current_admin.length) {
    admins.forEach((admin) => {
      functions.malling(
        msg,
        '<a href="tg://user?id=' +
          msg.from.id +
          '">' +
          msg.from.first_name +
          "</a>" +
          "\n" +
          (msg.text ? msg.text : msg.caption ? msg.caption : ""),
        admin.chat_id,
        bot
      );
    });
  }
}

function stopReminder() {
  reminder.forEach((element) => {
    clearInterval(element);
  });
  reminder = [];
}
function startReminder() {
  if (!reminder.length)
    reminder.push(
      setInterval(function sendNotifications() {
        const times = [
          "7.55",
          "9.35",
          "11.15",
          "12.45",
          "14.25",
          "15.55",
          "17.25",
        ];
        const exact_times = [
          "8.00",
          "9.40",
          "11.20",
          "12.50",
          "14.30",
          "16.00",
          "17.30",
        ];
        if (new Date().getDay() > 0) {
          let time = new Date().getHours() + "." + new Date().getMinutes();
          if (times.includes(time)) {
            data
              .run(
                "select * from users where notifications = 1 and eduprog not null and course not null"
              )
              .forEach((user) => {
                var sheet = new Sheet(user.eduprog),
                  courseColumn,
                  groups;
                courseColumn = sheet.courseColumn(course(user.course));
                groups = sheet.groups(courseColumn);
                timeRow = sheet.timeRow(
                  sheet.dayRow(new Date().getDay()),
                  exact_times[times.indexOf(time)]
                );

                var text = "";
                if (user.group_number)
                  text += "<i>" + user.group_number + " група</i>";
                if (
                  isDayEmpty(
                    sheet,
                    sheet.dayRow(new Date().getDay()),
                    courseColumn
                  )
                )
                  return;

                for (i = 0; i < groups.length - 1; i++) {
                  const lesson = oneLessonText(
                    sheet,
                    timeRow,
                    groups[i],
                    groups[i + 1] - groups[i]
                  );
                  if (lesson) {
                    if (
                      lesson.indexOf("(л)") == -1 &&
                      lesson.indexOf("Кластер") == -1 &&
                      lesson.indexOf("Кл.") == -1
                    ) {
                      //do not add a group ID when a pair exists for a cluster or is a lecture
                      if (user.group_number && user.group_number == i + 1)
                        text += lesson + "\n";
                      if (user.group_number == null)
                        text +=
                          "<u><b>" +
                          (i + 1) +
                          "</b> група</u>\n" +
                          lesson +
                          "\n";
                    } else {
                      text += lesson + "\n";
                    }
                  }
                }
                if (text)
                  functions
                    .malling(
                      { text: true },
                      "Через 5 хвилин починається пара<b>\n" +
                        sheet.cell(column(2) + (timeRow + 1)) +
                        "</b>\n" +
                        text,
                      user.user_id,
                      bot
                    )
                    .then(
                      (onfulfilled) => {
                        var senеNotifications = data.run(
                          "select number_of_visits from statistics where name = 'notifications'"
                        )[0].number_of_visits;
                        data.update(
                          "statistics",
                          { number_of_visits: senеNotifications + 1 },
                          { name: "notifications" }
                        );
                      },
                      (onrejected) => {
                        data.insert("blockedusers", {
                          user_id: user.user_id,
                          username: user.username,
                          first_name: user.first_name,
                        });
                        data.delete("users", { user_id: user.user_id });
                      }
                    );
              });
          }
        }
      }, 60000)
    );
}

startReminder();

// ██████╗░░█████╗░░█████╗░████████╗░█████╗░██████╗░  ██████╗░██████╗░██╗███╗░░░███╗███████╗
// ██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗██╔══██╗  ██╔══██╗██╔══██╗██║████╗░████║██╔════╝
// ██║░░██║██║░░██║██║░░╚═╝░░░██║░░░██║░░██║██████╔╝  ██████╔╝██████╔╝██║██╔████╔██║█████╗░░
// ██║░░██║██║░░██║██║░░██╗░░░██║░░░██║░░██║██╔══██╗  ██╔═══╝░██╔══██╗██║██║╚██╔╝██║██╔══╝░░
// ██████╔╝╚█████╔╝╚█████╔╝░░░██║░░░╚█████╔╝██║░░██║  ██║░░░░░██║░░██║██║██║░╚═╝░██║███████╗
// ╚═════╝░░╚════╝░░╚════╝░░░░╚═╝░░░░╚════╝░╚═╝░░╚═╝  ╚═╝░░░░░╚═╝░░╚═╝╚═╝╚═╝░░░░░╚═╝╚══════╝
