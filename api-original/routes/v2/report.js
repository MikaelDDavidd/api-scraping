const express = require("express");
const router = express.Router();
const date = require("date-and-time");
const db = require("../../mysql").db;
const connectionPromise = require("../../mysql").createConnectionPromise();

process.env.TZ = "America/Recife";

router.post("/", async (req, res, next) => {
  let keyword = req.body.keyword;
  let data = req.body.data;
  let dateUP = date.format(new Date(), "YYYY-MM-DD HH:mm:ss");
  await connectionPromise.query(
    db.insert("report", {
      keyword: keyword,
      data: data,
      date: dateUP,
    })
  );
  return res.status(200).send([]);
});

module.exports = router;
