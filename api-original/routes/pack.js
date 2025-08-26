const express = require("express");
const router = express.Router();
const db = require("../mysql.js").db;
const connectionPromise = require("../mysql.js").createConnectionPromise();
const utils = require("../utils.js");
const config = require("../config.js");
const fs = require("fs");
const date = require("date-and-time");

process.env.TZ = "America/Recife";

const ROOT_PATH = require("../root.js");

const LIMIT_PACKS = 25;
const NEW_PACK_MAX_TIME = 90;

router.post("/animated/:page", async (req, res, next) => {
  let page = req.params.page;
  let result = await getPacksV2({
    page: page,
    is_animated: true,
    sort: true,
    search: false,
  });
  return res.status(200).send(result);
});

router.post("/static/:page", async (req, res, next) => {
  let page = req.params.page;
  let result = await getPacksV2({
    page: page,
    is_animated: false,
    sort: true,
    search: false,
  });
  return res.status(200).send(result);
});

router.post("/animated/top/:page", async (req, res, next) => {
  let page = req.params.page;
  let result = await getPacksV2({
    page: page,
    is_animated: true,
    sort: false,
    order_by: "downloads",
    search: false,
  });
  return res.status(200).send(result);
});

router.post("/animated/new/:page", async (req, res, next) => {
  let page = req.params.page;
  let result = await getPacksV2({
    page: page,
    is_animated: true,
    sort: false,
    search: false,
    order_by: "id",
  });
  return res.status(200).send(result);
});

router.post("/static/top/:page", async (req, res, next) => {
  let page = req.params.page;
  let result = await getPacksV2({
    page: page,
    is_animated: false,
    sort: false,
    order_by: "downloads",
    search: false,
  });
  return res.status(200).send(result);
});

router.post("/static/new/:page", async (req, res, next) => {
  let page = req.params.page;
  let result = await getPacksV2({
    page: page,
    is_animated: false,
    sort: false,
    search: false,
    order_by: "id",
  });
  return res.status(200).send(result);
});

router.post("/animated/:page/:query", async (req, res, next) => {
  let page = req.params.page;
  let query = req.params.query;
  let result = await getPacksV2({
    page: page,
    is_animated: true,
    sort: false,
    search: query,
  });
  return res.status(200).send(result);
});

router.post("/static/:page/:query", async (req, res, next) => {
  let page = req.params.page;
  let query = req.params.query;
  let result = await getPacksV2({
    page: page,
    is_animated: false,
    sort: false,
    search: query,
  });
  return res.status(200).send(result);
});

router.get("/sticker/:identifier/:image", async (req, res, next) => {
  let image = req.params.image;
  let identifier = req.params.identifier;
  return res.sendFile(ROOT_PATH + config.PACKS_DIR + identifier + "/" + image);
});

router.get("/get/:identifier", async (req, res, next) => {
  let identifier = req.params.identifier;
  let file = ROOT_PATH + config.PACKS_DIR + identifier + "/pack.zip";
  if (await utils.fileExist(file)) {
    await connectionPromise.query(
      `UPDATE packs SET downloads = downloads + 1 WHERE identifier = "${identifier}"`
    );
    res.redirect('https://figurinhas.aitken.app/'+identifier+'/pack.zip');
  } else {
    return res.status(404).send({ error: "file not found" });
  }
});

async function getPacksV2(data) {
  let result = {};
  let offSet = (parseInt(data.page) - 1) * LIMIT_PACKS;
  let isAnimatedBinary = data.is_animated ? 1 : 0;
  let totalQuery = db.select("packs", ["id"], {
    is_animated: isAnimatedBinary,
  });
  let orderBy = "ORDER BY level DESC, downloads DESC, id DESC";
  if (data.order_by) {
    orderBy = `ORDER BY ${data.order_by} DESC, level DESC`;
  }
  let where = "";
  let whereType = `is_animated = ${isAnimatedBinary}`;
  if (data.search) {
    where = `${whereType} AND name LIKE '%${data.search}%' OR publisher LIKE '%${data.search}%'`;
    totalQuery = db.search(
      "packs",
      ["id"],
      { is_animated: data.is_animated ? 1 : 0 },
      { name: data.search, publisher: data.search }
    );
  } else {
    where = whereType;
  }
  let query = `SELECT
    stickers.pack_id AS sticker_pack_id,
    stickers.name AS sticker_name,
    packs.id AS pack_id,
    packs.name AS pack_name,
    packs.identifier,
    packs.publisher,
    packs.tray,
    packs.zip_size,
    packs.is_animated,
    packs.downloads,
    packs.date,
    packs.level
    FROM (SELECT * FROM packs WHERE ${where} ${orderBy} LIMIT ${LIMIT_PACKS} OFFSET ${offSet}) packs
    INNER JOIN stickers ON packs.id = stickers.pack_id`;

  var [totalPacks] = await connectionPromise.query(totalQuery);
  result.total_pages = Math.ceil(totalPacks.length / LIMIT_PACKS);

  console.log(query);
  var [packs] = await connectionPromise.query(query);
  packs = await parsePacksV2(packs);

  if (data.sort) {
    packs.sort(() => Math.random() - 0.5);
  } else {
    packs.sort((a, b) => a.id - b.id);
    packs.reverse();
  }
  if (packs.length <= 2) {
    await connectionPromise.query(
      db.insert("searched", {
        keywords: data.search,
        date: date.format(new Date(), "YYYY-MM-DD HH:mm:ss"),
      })
    );
  }
  result.packs = packs;
  return result;
}

async function parsePacksV2(dataPacks) {
  let packs = [];
  for (let i in dataPacks) {
    let searchPackIndex = packs.findIndex((e) => e.id == dataPacks[i].pack_id);
    if (searchPackIndex == -1) {
      let packIsNew = false;
      const today = new Date();
      const packDay = new Date(dataPacks[i].date);
      if (date.subtract(today, packDay).toHours() <= NEW_PACK_MAX_TIME) {
        packIsNew = true;
      }
      if (dataPacks[i].zip_size == 0) {
        let file =
          ROOT_PATH + config.PACKS_DIR + dataPacks[i].identifier + "/pack.zip";
        let packZip = fs.statSync(file);
        if (packZip.size) {
          dataPacks[i].zip_size = packZip.size;
          connectionPromise.query(
            db.update(
              "packs",
              { zip_size: dataPacks[i].zip_size },
              { id: dataPacks[i].pack_id }
            )
          );
        }
      }
      packs.push({
        id: dataPacks[i].pack_id,
        identifier: dataPacks[i].identifier,
        name: dataPacks[i].pack_name,
        publisher: dataPacks[i].publisher,
        tray: dataPacks[i].tray,
        zip_size: dataPacks[i].zip_size,
        is_animated: dataPacks[i].is_animated == 1 ? true : false,
        downloads: dataPacks[i].downloads,
        date: dataPacks[i].date,
        ref: config.PACKS_HOST,
        is_new: packIsNew,
        stickers: [],
      });
    }
  }
  for (let i in dataPacks) {
    let searchPackIndex = packs.findIndex(
      (e) => e.id == dataPacks[i].sticker_pack_id
    );
    if (searchPackIndex >= 0) {
      packs[searchPackIndex].stickers.push(dataPacks[i].sticker_name);
    }
  }
  return packs;
}

module.exports = router;
