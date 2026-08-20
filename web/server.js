const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataFile = path.join(__dirname, 'data.json');

function readStore() {
  if (!fs.existsSync(dataFile)) {
    return { patients: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      patients: Array.isArray(parsed.patients) ? parsed.patients : [],
    };
  } catch (error) {
    console.error('Unable to read local data store:', error.message);
    return { patients: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(dataFile, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/register', (req, res) => {
  const userID = typeof req.body.userID === 'string' ? req.body.userID.trim() : '';
  const userName = typeof req.body.userName === 'string' ? req.body.userName.trim() : '';
  const userDOB = typeof req.body.userDOB === 'string' ? req.body.userDOB.trim() : '';

  if (!userID || !userName || !/^\d{4}-\d{2}-\d{2}$/.test(userDOB)) {
    return res.status(400).json({ message: '請完整填寫使用者 ID、姓名與生日' });
  }

  if (userID.length > 64 || userName.length > 100) {
    return res.status(400).json({ message: '輸入內容過長' });
  }

  const store = readStore();
  const existingPatient = store.patients.find((patient) => patient.userID === userID);

  if (existingPatient) {
    return res.status(409).json({ message: '此使用者 ID 已註冊' });
  }

  store.patients.push({ userID, userName, userDOB });
  writeStore(store);
  return res.status(201).json({ message: '註冊成功' });
});

app.get('/patients', (_req, res) => {
  res.json(readStore().patients);
});

app.listen(port, () => {
  console.log(`Intelligent Eye Care demo: http://localhost:${port}`);
});
