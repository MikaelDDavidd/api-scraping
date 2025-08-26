const express = require("express");
const router = express.Router();
const webpReduce = require("../webp_reduce");
const connectionPromise = require("../mysql").createConnectionPromise();
const db = require("../mysql").db;
const utils = require("../utils");
const codeEmail = require("../emails/code");
const nodemailer = require("nodemailer");

const authPass = "djfi24yt-3849g3j8GSJ-4gj#3847g&h384";

router.get("/:token", async (req, res, next) => {
  let token = req.params.token;
  var [rows] = await connectionPromise.query(
    db.select("removed_ads", ["token", "active"], { token: token })
  );
  console.log(rows);
  if (rows.length == 1) {
    res.status(200).send({ status: rows[0].active == 1 ? true : false });
  } else {
    res.status(403).send({ status: false });
  }
});

router.post("/", async (req, res, next) => {
  let code = req.body.code;
  let auth = req.body.auth;
  let email = req.body.email;
  let purchase_id = req.body.purchase_id;
  let token = utils.generateRandomString(250);
  if (authPass == auth) {
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: "jocelino.pereira.figurinhas@gmail.com",
        pass: "hd634tuh3gyhv7e#HFHY",
      },
    });
    const mailOptions = {
      from: "jocelino.pereira.figurinhas@gamil.com",
      to: email,
      subject: "Remoção de Anúncios Do App 1001 Figurinhas Animada",
      html: codeEmail(code, token),
    };
    transporter.sendMail(mailOptions);
    await connectionPromise.query(
      db.insert("removed_ads", {
        code: code,
        purchase_id: purchase_id,
        email: email,
        active: 0,
        token: token,
      })
    );
    res.status(200).send({ success: true, token: token });
  } else {
    res.status(403).send({ success: false });
  }
});

router.get("/reactivate/:token", async (req, res, next) => {
  let token = req.params.token;
  await connectionPromise.query(
    db.update(
      "removed_ads",
      {
        active: 0,
      },
      {
        token: token,
      }
    )
  );
  res.status(200).send(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reativação do codigo de remoção</title>
    </head>
    <body>
      <h1>Seu código foi redefinido para ser usado em um novo dispositivo</h1>
    </body>
    </html>`);
});

router.get("/active/:code", async (req, res, next) => {
  let code = req.params.code;
  var [rows] = await connectionPromise.query(
    db.select("removed_ads", ["token", "active"], { code: code })
  );
  console.log(rows);
  if (rows.length >= 1) {
    if (rows[0].active == 0) {
      res.status(200).send({ success: true, token: rows[0].token });
      await connectionPromise.query(
        db.update(
          "removed_ads",
          {
            active: 1,
          },
          {
            token: rows[0].token,
          }
        )
      );
    } else {
      res.status(403).send({ status: false });
    }
  } else {
    res.status(403).send({ status: false });
  }
});

module.exports = router;
