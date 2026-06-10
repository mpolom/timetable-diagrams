# timetable-diagrams

Created with copilot and some very rusty coding skills.

- Download your latest network diagram from the **NWR Schedule** data product on [Rail Data Marketplace](https://raildata.org.uk/) (you will need to register an account)
- Drop that file into `/data/networkrail` and rename it `schedule-full.json.gz` *or* if you have a partial update, pop that into `/data/networkrail/updates`
- Create your route file (there is an example file for you there) and update it, referencing station names and TIPLOC codes from [RailwayCodes](http://www.railwaycodes.org.uk/crs/crs0.shtm)
- run `npm install`
- Run `node index.js` in a terminal

You'll need to wait for terminal confirmation that the full file has been loaded, then just head on over to `localhost:3000`