const express = require("express");
const router = express.Router();
const webpReduce = require("../webp_reduce");
const connectionPromise = require("../mysql").createConnectionPromise();
const utils = require("../utils");
const db = require("../mysql").db;
const axios = require("axios");

router.get("/", async (req, res, next) => {
  let result = {};
  var [packs] = await connectionPromise.query(
    db.select("packs", ["is_animated", "downloads"])
  );
  if (packs.length > 0) {
    result.total_packs = packs.length;
    result.total_animated_packs = 0;
    result.total_static_packs = 0;
    result.total_downloads_packs = 0;
    result.total_downloads_animated_packs = 0;
    result.total_downloads_static_packs = 0;
    for (let i in packs) {
      result.total_downloads_packs += parseInt(packs[i].downloads);
      if (packs[i].is_animated == 1) {
        result.total_animated_packs++;
        result.total_downloads_animated_packs += parseInt(packs[i].downloads);
      } else {
        result.total_static_packs++;
        result.total_downloads_static_packs += parseInt(packs[i].downloads);
      }
    }
  }
  res.status(200).send(result);
});

module.exports = router;
