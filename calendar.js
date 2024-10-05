import express from "express";
import morgan from "morgan";
import fetch from "node-fetch";
import puppeteer from "puppeteer";
import fs from "fs";
import yaml from "js-yaml";
import * as dotenv from "dotenv";
dotenv.config();
import { filterEvents, getEventsTitles } from "./icalutils/ical.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(morgan("combined"));

const config = readOrCreateConfigFile();
const urls = config?.calendar?.calendarURLs;
const subjects = config?.calendar?.subjects;
const excluded = config?.calendar?.exclude;

function readOrCreateConfigFile() {
  let config = null;
  try {
    config = yaml.load(fs.readFileSync("config/config.yml", "utf8"));
  } catch (e) {
    console.log(e);
    console.log("Config file not found. Creating... ");
    const data = {
      calendar: {
        subjects: ["subject1", "subject2", "..."],
        calendarURLs: ["url1", "url2", "..."],
      },
    };

    try {
      fs.writeFileSync("config/config.yml", yaml.dump(data), "utf8");
      console.log("Config file created");
    } catch (e) {
      console.log("could not create config yaml file", e);
    }
  }
  return config;
}

async function getTitles(page, filterId) {
  const subjectFilter = filterId.split(";", 4).pop();
  if (subjectFilter !== "0") {
    const ids = subjectFilter.split(",");
    return await page.evaluate((ids) => {
      return ids.map(
        (id) =>
          document.querySelector(`tr[data-rk="${id}"]`).querySelector("span")
            .innerHTML
      );
    }, ids);
  }
  return null;
}

async function clickExport(page) {
  await page.evaluate(() => {
    const node = document.querySelector(
      'a[title="Izvoz celotnega urnika v ICS formatu  "]'
    );
    if (node == null) {
      throw "Export button not found";
    }
    const handler = node.getAttributeNode("onclick").nodeValue;
    node.setAttribute("onclick", handler.replace("_blank", "_self"));
    node.click();
  });
}

function setupDownloadHook(page, cookies) {
  return new Promise((resolve) => {
    page.on("request", async (request) => {
      console.log(request.url());

      if (
        request.url() === "https://www.wise-tt.com/wtt_up_famnit/TextViewer"
      ) {
        const response = await fetch(request.url(), {
          headers: {
            ...request.headers(),
            cookie: cookies
              .map((cookie) => `${cookie.name}=${cookie.value}`)
              .join(";"),
          },
        });
        const data = await response.text();
        resolve(data);
      } else {
        request.continue(); // Redirect 302
      }
    });
  });
}

async function fetchCalendar(url) {
  const browser = await puppeteer.launch({
    // executablePath: "google-chrome-stable",
    executablePath: "/usr/bin/chromium",
    headless: "new",
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(url);

    await page.setRequestInterception(true);
    const cookies = await page.cookies();
    const download = setupDownloadHook(page, cookies);

    const url1 = new URL(url);
    const params = new URLSearchParams(url1.search);
    const filterId = params.get("filterId");

    if (!filterId) {
      return null;
    }
    const titles = await getTitles(page, filterId);

    await clickExport(page);
    let data = await download;

    if (titles != null) {
      data = data.replace(/\s*BEGIN:VEVENT[\s\S]*?END:VEVENT\s*/g, (event) => {
        return titles.some((title) => event.includes(`SUMMARY:${title}`))
          ? event
          : "";
      });
    }

    const position = data.indexOf("BEGIN:VEVENT");
    data =
      data.substr(0, position) +
      "X-WR-TIMEZONE:Europe/Ljubljana\n" +
      data.substr(position);

    return data;
  } finally {
    await browser.close();
  }
}

const fetchAll = async (urls) => {
  const calendars = [];
  await Promise.all(
    urls.map(async (url) => {
      let cal = await fetchCalendar(url);
      if (cal != null) {
        calendars.push(cal);
      }
    })
  );
  return calendars;
};

const mergeCalendars = (calendars) => {
  let output = "";
  for (let i = 0; i < calendars.length; i++) {
    if (i != 0) {
      // calendars[i] = calendars[i].replace('BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:WISE TIMETABLE\nX-WR-TIMEZONE:Europe/Ljubljana', '');
      calendars[i] = calendars[i].replace("BEGIN:VCALENDAR", "");
      calendars[i] = calendars[i].replace("VERSION:2.0", "");
      calendars[i] = calendars[i].replace("PRODID:WISE TIMETABLE", "");
      calendars[i] = calendars[i].replace("X-WR-TIMEZONE:Europe/Ljubljana", "");
    }
    if (i != calendars.length - 1) {
      calendars[i] = calendars[i].replace("END:VCALENDAR", "");
    }
    output += calendars[i];
  }
  return output;
};

const getIcal = async (urls) => {
  const calendars = await fetchAll(urls);
  const formatted = mergeCalendars(calendars);
  const filtered = filterEvents(formatted, subjects, excluded);
  return filtered;
};

const getUniqueTitles = async (urls) => {
  const calendars = await fetchAll(urls);
  const formatted = mergeCalendars(calendars);
  const eventTitles = getEventsTitles(formatted);
  return eventTitles;
};

const saveTxt = (text) => {
  fs.writeFile("calendars.txt", text, (err) => {
    if (err) console.log(err);
    return;
  });
};

app.get("/", (req, res) => {
  res.redirect("https://github.com/brokenpylons/Calendar");
});

app.get("/up", (req, res) => {
  res.set("content-type", "text/plain");
  res.send("yes");
});

app.get("/titles", async (req, res) => {
  try {
    const data = await getUniqueTitles(filterIds);
    res.send(data);
  } catch (e) {
    console.log(e);
    res.sendStatus(404);
  }
});

app.get("/calendar", async (req, res) => {
  res.set("content-type", "text/plain");

  try {
    const data = await getIcal(urls);
    res.status(200).send(data);
  } catch (e) {
    console.log(e);
    res.sendStatus(404);
  }
});

app.listen(port);
console.log(`Listening on port: ${port}`);
