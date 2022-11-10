import express from 'express';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import {fetchAll} from './calendar.js';
import { fetchCalendar } from './calendar.js';

const filter_ids = [
  '0;118,78,77,51;0;0;',
  '0;70;0;0;'
]

const app = express();

app.use(morgan('combined'));

app.get('/', (req, res) => { 
  res.redirect('https://github.com/brokenpylons/Calendar');
});

app.get('/up', (req, res) => { 
  res.set('content-type', 'text/plain');
  res.send('yes');
});

app.get('/calendar', async (req, res) => {
  res.set('content-type', 'text/plain');

  try {
    const data = await fetchAll(filter_ids);
    res.send(data);
  } catch(e) {
    console.log(e);
    res.sendStatus(404);
  }
});

const port = process.env.PORT || 8080;
const host = process.env.HOST || 'localhost';

app.listen(port, host);
console.log(`${host}:${port}`);