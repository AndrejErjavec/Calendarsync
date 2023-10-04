# Calendar
![GitHub](https://img.shields.io/github/license/brokenpylons/Calendar.svg)
![Uptime Robot status](https://img.shields.io/uptimerobot/status/m782317712-2ae246eb8b50066d57d5fc80.svg)

A little service that fetches iCalendar files from the "Wise Time Table".

## Why?
The "Wise Time Table" serves the iCalendar files in an disingenuous way. They open a new page, redirect to a different URL and return the content as ```application/octet-stream```, so the calendar cannot be consumed by other applications (only imported).

## Solution
This service downloads the iCalendar file on request and serves it as ```text/plain```.

The code has been forked and chenged to fit my needs. I use docker to host small applications so I created a ```docker-compose.yml``` file that enables easy and quick deployment on environments using Docker and Docker Compose.