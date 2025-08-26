const express = require("express");
const router = express.Router();
const poolPromise = require("../../mysql").poolPromise();
const date = require("date-and-time");

router.get("/", async (req, res, next) => {
  // ads: admob || fb || sem
  return res.status(200).send({
    ads: "admob",
    showAlwaysIntertisitial: false,
    banner:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Banner",
    interstitial:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Interstitial",
    app_open:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Openapp",
    native:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Native",
  });
});

router.get("/secondary/", async (req, res, next) => {
  // ads: admob || fb
  return res.status(200).send({
    ads: "admob",
    showAlwaysIntertisitial: false,
    banner:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Banner",
    interstitial:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Interstitial",
    app_open:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Openapp",
    native:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Native",
  });
});

router.get("/secondary2/", async (req, res, next) => {
  // ads: admob || fb
  return res.status(200).send({
    ads: "admob",
    showAlwaysIntertisitial: false,
    banner:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Banner",
    interstitial:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Interstitial",
    app_open:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Openapp",
    native:
      "/22106840220,22885043563/ca-mb-app-pub-9063486391387983-tag/1001_Figurinhas_Animadas_Whats_Native",
  });
});

router.post("/count/", async (req, res, next) => {
  let pass =
    "JHjD74D98D7Dd-s3X0Kf-j347dMdh7F3NxKq846-7DSA4fs-sdf875f32148HUSfSg";
  let key = req.body.key;
  let actionX = req.body.action;
  let type = req.body.type;
  let dateUP = date.format(new Date(), "YYYY-MM-DD");
  if (key == pass) {
    let action = "impression";
    if (actionX != "impression") {
      action = actionX == "request" ? "request" : "click";
    }
    let [rows] = await poolPromise.query(
      `SELECT * FROM ads WHERE date = ? AND type = ?`,
      [dateUP, type]
    );
    if (rows.length >= 1) {
      await poolPromise.query(
        `UPDATE ads SET ${action} = ${action}+1 WHERE id = ?`,
        [rows[0].id]
      );
    } else {
      await poolPromise.query(
        `INSERT INTO ads (date, type, ${action}) VALUES (?,?,?)`,
        [dateUP, type, 1]
      );
    }
  }
  return res.status(200).send({ ok: true });
});

module.exports = router;
