import express from 'express';
import morgan from 'morgan';
import fetch from 'node-fetch';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import {deleteEventOccurances, getEventsTitles} from './icalutils/ical.js';
import path from 'path';
import * as dotenv from 'dotenv'
dotenv.config()

const filterIds = [
  '0;81;0;0'
]

const subjects = [
  'Podatkovne baze za masovne podatke',
  'Izbrana poglavja iz vzporednega programiranja',
  'Računalniški raziskovalni seminar',
  'Izbrana poglavja iz teorije algoritmov',
  'Izbrana poglavja iz teoretičnih osnov računalništva',
  'Izbrana poglavja iz obdelave slik'
]

const app = express(); 

const port = process.env.PORT || 5000;
const browser_path = process.env.NODE_ENV === 'production' ? process.env.PROD_BROWSER_PATH : process.env.DEV_BROWSER_PATH;
console.log(browser_path);
if (!browser_path) {
  throw new Error("Path to the browser must be specified");
}

app.use(morgan('combined'));

async function getTitles(page, filterId) {
  const subjectFilter = filterId.split(';', 4).pop();
  if (subjectFilter !== '0') {
    const ids = subjectFilter.split(',');
    return await page.evaluate((ids) => {
      return ids.map(id => document.querySelector(`tr[data-rk="${id}"]`).querySelector('span').innerHTML);
    }, ids);
  }
  return null;
}

async function clickExport(page) {
  await page.evaluate(() => {
    const node = document.querySelector('a[title="Izvoz celotnega urnika v ICS formatu  "]');
    if (node == null) {
      throw 'Export button not found';
    }
    const handler = node.getAttributeNode('onclick').nodeValue;
    node.setAttribute('onclick', handler.replace('_blank', '_self'));
    node.click();
  });
}

function setupDownloadHook(page, cookies) {
  return new Promise(resolve => {
    page.on('request', async request => {
      console.log(request.url());

      if (request.url() === 'https://www.wise-tt.com/wtt_up_famnit/TextViewer') {
        const response = await fetch(request.url(), {
          headers: {
            ...request.headers(),
            'cookie': cookies.map(cookie => `${cookie.name}=${cookie.value}`).join(';'),
          }
        });
        const data = await response.text();
        resolve(data);
      } else {
        request.continue(); // Redirect 302
      }
    });
  });
}

async function fetchCalendar(filterId) {
  const browser = await puppeteer.launch({executablePath: browser_path, headless: true, args: ['--no-sandbox']
});
  try {
    const page = await browser.newPage();
    await page.goto(`https://www.wise-tt.com/wtt_up_famnit/index.jsp?filterId=${filterId}`);
  
    await page.setRequestInterception(true);
    const cookies = await page.cookies();
    const download = setupDownloadHook(page, cookies);
    const titles = await getTitles(page, filterId);

    await clickExport(page);
    let data = await download;

    if (titles != null) {
      data = data.replace(/\s*BEGIN:VEVENT[\s\S]*?END:VEVENT\s*/g, event => {
        return titles.some(title => event.includes(`SUMMARY:${title}`)) ? event : '';
      });
    }

    const position = data.indexOf('BEGIN:VEVENT');
    data = data.substr(0, position) + 'X-WR-TIMEZONE:Europe/Ljubljana\n' + data.substr(position);

    return data;
  } finally {
    await browser.close();
  }
}

const fetchAll = async (filterIds) => {
  console.log(filterIds);
  const calendars = [];
  await Promise.all(filterIds.map(async (filterId) => {
    let cal = await fetchCalendar(filterId);
    calendars.push(cal);
  }))
  return calendars;
}

const formatCalendars = (calendars) => {
  let output = "";
  for (let i = 0; i < calendars.length; i++) {
    if (i != 0) {
      // calendars[i] = calendars[i].replace('BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:WISE TIMETABLE\nX-WR-TIMEZONE:Europe/Ljubljana', '');
      calendars[i] = calendars[i].replace('BEGIN:VCALENDAR', '');
      calendars[i] = calendars[i].replace('VERSION:2.0', '');
      calendars[i] = calendars[i].replace('PRODID:WISE TIMETABLE', '');
      calendars[i] = calendars[i].replace('X-WR-TIMEZONE:Europe/Ljubljana', '');
    }
    if (i != calendars.length - 1) {
      calendars[i] = calendars[i].replace('END:VCALENDAR', '');
    }
    output += calendars[i];
  }
  return output;
}

const getIcal = async (filterIds) => {
  const calendars = await fetchAll(filterIds);
  const formatted = formatCalendars(calendars);
  const filtered = deleteEventOccurances(formatted, subjects);
  return filtered;
}

const getUniqueTitles = async (filterIds) => {
  const calendars = await fetchAll(filterIds);
  const formatted = formatCalendars(calendars);
  const eventTitles = getEventsTitles(formatted);
  return eventTitles;
}

const saveTxt = (text) => {
  fs.writeFile('calendars.txt', text, err => {
    if (err) console.log(err);
    return;
  })
}

app.get('/', (req, res) => { 
  res.redirect('https://github.com/brokenpylons/Calendar');
});

app.get('/up', (req, res) => { 
  res.set('content-type', 'text/plain');
  res.send('yes');
});

app.get('/titles', async (req, res) => {
  try {
    const data = await getUniqueTitles(filterIds);
    res.send(data);
  } catch(e) {
    console.log(e);
    res.sendStatus(404);
  }
})

app.get('/calendar', async (req, res) => {
  res.set('content-type', 'text/plain');

  try {
    const data = await getIcal(filterIds);
    res.send(data);
  } catch(e) {
    console.log(e);
    res.sendStatus(404);
  }
});

app.get('/all', async (req, res) => {
  res.set('content-type', 'text/plain');

  try {
    const data = await fetchAll(filterIds);
    const formatted = formatCalendars(data);
    res.send(formatted);
  } catch(e) {
    console.log(e);
    res.sendStatus(404);
  }
});

app.listen(port);
console.log(`Listening on port: ${port}`);
