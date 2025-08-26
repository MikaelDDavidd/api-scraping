const express = require("express");
const router = express.Router();
var AdmZip = require("adm-zip");
var rootPath = require("../../root.js");
const fs = require("fs");
const db = require("../../mysql.js").db;
const connectionPromise = require("../../mysql.js").createConnectionPromise();

router.get("/:identifier/:image", async (req, res, next) => {
  let imageName = req.params.image;
  let identifier = req.params.identifier;
  let imagePath = `${rootPath}/packs/${identifier}/${imageName}`;
  let zipPath = `${rootPath}/packs/${identifier}/pack.zip`;

  var zip = new AdmZip(zipPath);

  await zip.extractEntryTo(
    imageName,
    `${rootPath}/packs/${identifier}/`,
    false,
    true
  );

  let [stickerData] = await connectionPromise.query(
    db.select("packs", ["identifier", "id"], {
      identifier: identifier,
    })
  );
  connectionPromise.query(
    `UPDATE stickers SET downloads = downloads + 1 WHERE pack_id = ${stickerData[0].id} AND name = '${imageName}'`
  );

  res.set({
    "Content-Type": "application/octet-stream",
    "Content-Length": fs.statSync(imagePath).size,
  });
  return res.sendFile(imagePath);
});

router.get("/get_utils", async (req, res, next) => {
  return res.sendFile(rootPath + "/downloads/sticker_utils.zip");
});

module.exports = router;
