const express = require("express");
const MongoClient = require("mongodb").MongoClient;
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const cookieParser = require("cookie-parser");
const mime = require("mime-types");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "TradingBotDB";
const COLLECTION_NAME = "ScoidData";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

let client;

async function connectToMongo() {
  try {
    client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    setTimeout(connectToMongo, 5000); // Attempt to reconnect after 5 seconds
  }
}

connectToMongo();

async function getScoidCollection() {
  if (!client || !client.topology.isConnected()) {
    await connectToMongo();
  }

  return client.db(DB_NAME).collection(COLLECTION_NAME);
}

app.get("/allData", async (req, res) => {
  const collection = await getScoidCollection();
  const scoid = await collection.find({}).toArray();
  res.send(scoid);
});

app.post("/updatenewstocks", async (req, res) => {
  const collection = await getScoidCollection();

  // The request data from Python will be in JSON format, so use req.body.symbols
  let symbolList = req.body;

  // Get all existing symbols
  const existingSymbols = await collection
    .find({}, { projection: { symbol: 1, _id: 0 } })
    .toArray();

  // Create a Set of existing symbols for efficient lookup
  const existingSymbolsSet = new Set(existingSymbols.map((s) => s.symbol));

  // For each input symbol, if it doesn't exist in the Set, insert it into the database
  for (const symbol of symbolList) {
    if (!existingSymbolsSet.has(symbol)) {
      await collection.insertOne({ symbol: symbol, data: {} });
    }
  }

  res.send({ message: "Symbols processed successfully." });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

app.post("/setkscoids", async (req, res) => {
  const collection = await getScoidCollection();

  // The request data from JavaScript will be in JSON format
  let kscoids = req.body;

  // Keep track of the count of updated symbols
  let updatedSymbolsCount = 0;

  // For each symbol in kscoids, update the ksoid in the database
  for (const symbol in kscoids) {
    let updatedDocument = await collection.updateOne(
      { symbol: symbol },
      { $set: { ksoid: kscoids[symbol] } }
    );

    // If MongoDB successfully updated the document (i.e., modified count is 1)
    if (updatedDocument.modifiedCount === 1) {
      updatedSymbolsCount++;
    }
  }

  res.send({ message: `${updatedSymbolsCount} symbols updated successfully.` });
});
