\# Tide Pattern Matcher (Australia)



Pick a spot on the Australian coast, choose a \*\*base tide day\*\*, then search a

future range for \*\*matching tide patterns\*\*.



\- Base graph in solid line

\- Overlay graph in dashed line

\- Hybrid similarity score (correlation + RMSE) between 0 and 1

\- Scroll candidate days with a slider, or jump straight to the best match



\## Running on GitHub Pages



1\. Put `index.html`, `styles.css`, and `app.js` in the root of your repo.

2\. Enable GitHub Pages for the repo.

3\. Optionally point `TIDE\_API\_BASE` in `app.js` at a backend you host somewhere.



If no backend is available, the app uses a \*\*mock sine-wave tide generator\*\* so

you can test the UI.



\## Tides backend



The frontend expects a `GET /api/tides` endpoint returning:



```json

{

&nbsp; "station": { "id": "abc", "name": "Some Station" },

&nbsp; "timezone": "Australia/Sydney",

&nbsp; "data": \[

&nbsp;   {

&nbsp;     "date": "2025-11-22",

&nbsp;     "times": \["00:00", "01:00", "..."],

&nbsp;     "heights": \[1.2, 1.3, "..."]

&nbsp;   }

&nbsp; ]

}



