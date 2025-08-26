const express = require("express");
const morgan = require("morgan");
const app = express();
const bodyParser = require("body-parser");

const rootRoute = "/figurinhas";
const webpRouter = require("./routes/webp");
const packRouter = require("./routes/pack");
const statisticsRouter = require("./routes/statistics");
const adsRouter = require("./routes/ads");

const v2PackRouter = require("./routes/v2/pack");
const v2StickerRouter = require("./routes/v2/sticker");
const v2SReportRouter = require("./routes/v2/report");
const v2SConfigsRouter = require("./routes/v2/configs");

const v3PackRouter = require("./routes/v3/pack");

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan("dev"));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Header",
    "Origin, Content-Type, X-Requested-With, Accept, Authorization"
  );
  if (req.method == "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT, PATCH");
  }
  next();
});

app.use(rootRoute + "/webp", webpRouter);
app.use(rootRoute + "/pack", packRouter);
app.use(rootRoute + "/statistics", statisticsRouter);
app.use(rootRoute + "/ads", adsRouter);

app.use(rootRoute + "/v2/pack", v2PackRouter);
app.use(rootRoute + "/v2/sticker", v2StickerRouter);
app.use(rootRoute + "/v2/report", v2SReportRouter);
app.use(rootRoute + "/v2/configs", v2SConfigsRouter);

app.use(rootRoute + "/v3/pack", v3PackRouter);

app.use((req, res, next) => {
  const error = new Error("not found");
  error.status = 404;
  next(error);
});

app.use((error, req, res, next) => {
  res.status(error.status || 500);
  return res.send({
    error: error.message,
  });
});

module.exports = app;
