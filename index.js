app.post("/webhook", async (req, res) => {
  const data = req.body;

  console.log("[Webhook]", JSON.stringify(data));

  // bỏ check transferType vì SePay không gửi field này
  const content = (data.description || "")
    .toUpperCase()
    .replace(/\s+/g, "");

  const match = content.match(/GIAHANTHE([A-F0-9]{8})/);

  if (!match) {
    return res.send("no match");
  }

  const uid = match[1];

  // SePay dùng amount hoặc transferAmount tùy payload
  const amount =
    data.transferAmount ||
    data.amount ||
    0;

  // đổi từ 50000 xuống 2000
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
    lastPayment:
      data.transactionDate ||
      new Date().toISOString(),
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