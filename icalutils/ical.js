export const deleteEventOccurances = (ical, events) => {
    let lines = ical.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('SUMMARY:') && !events.some(event => lines[i].includes(event))) {
            lines.splice(i-6, 9);
            i-=9;
        }
    }
    lines = lines.join('\n');
    return lines;
}
