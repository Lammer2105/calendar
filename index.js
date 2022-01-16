const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const bot = new TelegramBot(process.env.CALENDAR_BOT, { polling: true });
const data = require("sqlite-sync");
data.connect("database/calendar.db");
const functions = require("./db_worker");
if (typeof require !== "undefined") XLSX = require("xlsx");
var fs = require("fs");

var registration = {};

bot.onText(/\/start/, async (msg) => {
  if (
    data.run("select count (*) as cnt from users where user_id = ?", [
      msg.chat.id,
    ])[0].cnt == 0
  ) {
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
  var chatId = query.message.chat.id;
  if (functions.adminPanel(query, bot) != "end") return;
  var eduprogs = data.run("select * from eduprogs");
  let user = new User(query.message.chat.id);
  let keyboard = menu_keyboard(query.data, chatId);

  for (let i = 0; i < eduprogs.length; i++) {
    eduprogs[i] = eduprogs[i].query;
  }
  if (chatId in registration) {
    if (registration[chatId].course) {
      if (query.data != "skipCourse" && !isNaN(query.data))
        data.update("users", { course: +query.data }, { user_id: chatId });
      settingsMessage(query);
      registration[chatId].course = false;
    }
    if (registration[chatId].eduprog) {
      var text = "";
      if (eduprogs.includes(query.data)) {
        data.update("users", { eduprog: query.data }, { user_id: chatId });
        text =
          "Обрано освітню програму " +
          data.run("select name from eduprogs where query = ?", [query.data])[0]
            .name;
      }
      bot.editMessageText(text + "\nОберіть курс", {
        parse_mode: "HTML",
        chat_id: chatId,
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
            [{ text: "Пропустити крок", callback_data: "skipCourse" }],
          ],
        },
      });
      registration[chatId].eduprog = false;
      registration[chatId].course = true;
    }
  }
  if (
    query.data == "notify" ||
    query.data == "notnotify" ||
    query.data == "settings"
  ) {
    if (query.data == "notify")
      data.update("users", { notifications: 1 }, { user_id: chatId });
    if (query.data == "notnotify")
      data.update("users", { notifications: 0 }, { user_id: chatId });
    settingsMessage(query);
  }
  if (query.data == "register") {
    functions.register(query, bot);
    registration[chatId] = {
      eduprog: true,
      course: false,
    };
  }
  if (query.data == "menu") {
    bot.editMessageText(
      data.run('select * from phrases where keyword = "menu"')[0].content,
      {
        chat_id: chatId,
        parse_mode: "HTML",
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    );
  }
  keyboard.unshift([
    {
      text: "Оновити",
      callback_data: query.data,
    },
  ]);
  if (query.data == "today") {
    if (
      getFiles("excelfiles").includes(
        "excelfiles/" +
          data.run("select * from users where user_id = ?", [chatId])[0]
            .eduprog +
          ".xlsx"
      )
    ) {
      var course = "";
      if (user.course > 4)
        course = "магістратура - " + (user.course - 4) + " курс";
      else course = user.course + " курс";

      var text =
        data.run("select name from eduprogs where query = ?", [user.eduprog])[0]
          .name +
        " " +
        course +
        "\n" +
        oneDayText(new Date().getDay(), user.eduprog, course);

      if (isTextEqual(text, query.message.text)) return;
      bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: keyboard,
        },
        parse_mode: "HTML",
      });
    } else {
      bot.sendMessage(chatId, "Розклад для Вашої ОП ще не завантажено");
    }
  }
  if (query.data == "week") {
    if (
      getFiles("excelfiles").includes(
        "excelfiles/" +
          data.run("select * from users where user_id = ?", [chatId])[0]
            .eduprog +
          ".xlsx"
      )
    ) {
      var course;
      if (user.course > 4)
        course = "магістратура - " + (user.course - 4) + " курс";
      else course = user.course + " курс";

      var text =
        data.run("select name from eduprogs where query = ?", [user.eduprog])[0]
          .name +
        " " +
        course +
        "\n";
      for (let i = 1; i < 6; i++) {
        text += oneDayText(i, user.eduprog, course);
      }
      if (isTextEqual(text, query.message.text)) return;
      try {
        bot.editMessageText(text, {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: keyboard,
          },
          parse_mode: "HTML",
        });
      } catch (error) {}
    } else {
      bot.sendMessage(chatId, "Розклад для Вашої ОП ще не завантажено");
    }
  }
});

function oneDayText(day, eduprog, course) {
  var text = getWeekDay(day);
  var dayRow,
    courseColumn,
    numberOfColumns,
    numberOfRows,
    numberOfGroups = 0;
  var sheet = new Sheet(eduprog);
  if (day == 0) return text + "\n<b>День самостійної роботи</b>";
  for (let i = 1; true; i++) {
    if (sheet.cell("A" + i) == text) {
      dayRow = i;
      for (let j = i + 1; isNaN(numberOfRows); j++) {
        if (sheet.cell("A" + j) != "") {
          numberOfRows = j - i;
          break;
        }
      }
    }
    if (sheet.cell(column(i) + "6") == course) {
      courseColumn = i;
      for (let j = i + 1; isNaN(numberOfColumns); j++) {
        if (sheet.cell(column(j) + "6") != "") {
          numberOfColumns = j - i;
          for (let k = courseColumn; k < courseColumn + numberOfColumns; k++) {
            if (sheet.cell(column(k) + "8") != "") numberOfGroups += 1;
          }
          break;
        }
      }
    }
    if (!isNaN(numberOfColumns) && !isNaN(numberOfRows)) break;
  }
  text += ":\n";
  for (let j = dayRow; j < dayRow + numberOfRows; j++) {
    if (sheet.cell(column(courseColumn) + j).toUpperCase() == "ДЕНЬ") {
      text += "<b>День самостійної роботи</b>";
      return text;
    }
  }

  for (let j = dayRow; j < dayRow + numberOfRows; j += 4) {
    let classes = "";
    let isLessonEmpty = true;
    for (
      let i = courseColumn, k = 1;
      i < courseColumn + numberOfColumns;
      i += numberOfColumns / numberOfGroups, k++
    ) {
      if (oneLessonText(sheet, j, i, numberOfColumns / numberOfGroups)) {
        classes +=
          "<u><b>" +
          k +
          "</b> група</u>\n" +
          oneLessonText(sheet, j, i, numberOfColumns / numberOfGroups) +
          "\n";
        isLessonEmpty = false;
      }
    }
    if (!isLessonEmpty) {
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
  let text = "";
  let week = false;
  for (let j = col; j < col + numberOfColumns; j++) {
    if (
      (sheet
        .cell(column(j) + (row + 2))
        .charAt(0)
        .toUpperCase() == sheet.cell(column(j) + (row + 2)).charAt(0) &&
        sheet.cell(column(j) + (row + 2)) != "" &&
        sheet.cell(column(j) + row) != "") ||
      (sheet.cell(column(j) + (row + 2)) != "" &&
        sheet.cell(column(j) + row) == "") ||
      (sheet.cell(column(j) + row) != "" &&
        sheet.cell(column(j) + (row + 2)) == "")
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
  var keyboard = [[]];
  var row = 0;
  for (let index = 0; index < menu_keyboard.length; index++) {
    const keyb_button = menu_keyboard[index];
    if (index % 2 == 0) {
      row++;
      keyboard.push([]);
    }
    if (callback_data === keyb_button.callback_data) {
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
    )[0].cnt > 0
  ) {
    keyboard.push(functions.adminPanelMenu[0]);
  }
  return keyboard;
}

function settingsMessage(query) {
  var notifications;
  let user = new User(query.message.chat.id);
  user.notifications
    ? (notifications = "увімкнено")
    : (notifications = "вимкнено");
  bot.editMessageText(
    "Поточні налаштування\nОсвітня програма: <b>" +
      user.eduprog +
      "</b>\nКурс: <b>" +
      user.course +
      "</b>\nСповіщення про початок пари <b>" +
      notifications +
      "</b>",
    {
      parse_mode: "HTML",
      message_id: query.message.message_id,
      chat_id: query.message.chat.id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Змінити📝", callback_data: "register" },
            {
              text: user.notifications ? "🔕" : "🔔",
              callback_data: user.notifications ? "notnotify" : "notify",
            },
          ],
          [{ text: "Головне меню «", callback_data: "menu" }],
        ],
      },
    }
  );
}

var getFiles = function (dir, files_) {
  files_ = files_ || [];
  var files = fs.readdirSync(dir);
  for (var i in files) {
    var name = dir + "/" + files[i];
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files_);
    } else {
      files_.push(name);
    }
  }
  return files_;
};

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
      this.desiredCell = this.worksheet[coord];
      return this.desiredCell ? this.desiredCell.v : "";
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
  }
}

// ██████╗░░█████╗░░█████╗░████████╗░█████╗░██████╗░  ██████╗░██████╗░██╗███╗░░░███╗███████╗
// ██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗██╔══██╗  ██╔══██╗██╔══██╗██║████╗░████║██╔════╝
// ██║░░██║██║░░██║██║░░╚═╝░░░██║░░░██║░░██║██████╔╝  ██████╔╝██████╔╝██║██╔████╔██║█████╗░░
// ██║░░██║██║░░██║██║░░██╗░░░██║░░░██║░░██║██╔══██╗  ██╔═══╝░██╔══██╗██║██║╚██╔╝██║██╔══╝░░
// ██████╔╝╚█████╔╝╚█████╔╝░░░██║░░░╚█████╔╝██║░░██║  ██║░░░░░██║░░██║██║██║░╚═╝░██║███████╗
// ╚═════╝░░╚════╝░░╚════╝░░░░╚═╝░░░░╚════╝░╚═╝░░╚═╝  ╚═╝░░░░░╚═╝░░╚═╝╚═╝╚═╝░░░░░╚═╝╚══════╝
