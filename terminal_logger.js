import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/log-explanation', (req, res) => {
  console.log(`📢 Slide Explanation (${req.body.language}):\n${req.body.text}\n`);
  res.sendStatus(200);
});

app.listen(4000, () => console.log('Logger server running on http://localhost:4000'));
