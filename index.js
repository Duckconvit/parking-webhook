const express = require("express");
const admin   = require("firebase-admin");

const app = express();

app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

app.post("/webhook", async (req, res) => {
  const data = req.body;

  console.log("[Webhook]", JSON.stringify(data));

  if (data.transferType !== "in") {
    return res.send("ignored");
  }

  const content = (data.content || "")
    .toUpperCase()
    .replace(/\s+/g, "");

  // ── KHÁCH VÃNG LAI ──────────────────────────
  if (content.includes("KHACHVANGLAI")) {
    await db.ref("/parking/walkin").set("yes");
    console.log("✅ Khách vãng lai → set walkin = yes");
    return res.send("walkin ok");
  }
  // ────────────────────────────────────────────
  
  const match = content.match(/GIAHANTHE([A-F0-9]{8})/);

  if (!match) {
    return res.send("no match");
  }

  const uid = match[1];

  const amount = data.transferAmount || 0;

  // đổi 50k -> 2k
  if (amount < 2000) {
    return res.send("amount too low");
  }

  const cardRef = db.ref(`/parking/rfid_cards/${uid}`);

  const snapshot = await cardRef.once("value");

  if (!snapshot.exists()) {
    return res.send("card not found");
  }

  const card = snapshot.val();

  let baseDate = new Date();

  if (card.expiry) {
    const d = new Date(card.expiry);

    if (d > baseDate) {
      baseDate = d;
    }
  }

  baseDate.setDate(baseDate.getDate() + 30);

  const newExpiry = baseDate
    .toISOString()
    .split("T")[0];

  await cardRef.update({
    expiry: newExpiry,
    active: true,
    lastPayment: data.transactionDate || new Date().toISOString(),
    lastAmount: amount,
  });

  await db.ref(`/parking/payments/${uid}/latest`).set({
    status: "success",
    newExpiry,
    amount,
    time: Date.now(),
  });

  console.log(`✅ Thẻ ${uid} → gia hạn đến ${newExpiry}`);

  res.send("ok");
});

app.get("/", (req, res) => {
  res.send("Parking webhook running ✅");
});

app.listen(3000, () => {
  console.log("Server chạy port 3000");
});
