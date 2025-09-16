const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dsatracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Models
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});
const User = mongoose.model('User', UserSchema);

const ProblemSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  status: { type: String, enum: ['solved', 'unsolved', 'review'], default: 'unsolved' },
  platform: { type: String, default: 'LeetCode' },
  timesSolved: { type: Number, default: 1 },
  date: { type: String, default: () => new Date().toISOString().substr(0,10) }
});
const Problem = mongoose.model('Problem', ProblemSchema);

// Auth routes
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ name, email, password: hashed });
    res.json({ id: user._id, name: user.name, email: user.email });
  } catch (err) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
  res.json({ token, id: user._id, name: user.name, email: user.email });
});

// Auth middleware
function auth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Problem CRUD routes
app.get('/api/problems', auth, async (req, res) => {
  const problems = await Problem.find({ userId: req.userId });
  res.json(problems);
});

app.post('/api/problems', auth, async (req, res) => {
  const { title, status, platform, timesSolved, date } = req.body;
  const problem = await Problem.create({
    userId: req.userId,
    title,
    status,
    platform,
    timesSolved,
    date: date && date.length > 0 ? date : undefined
  });
  res.json(problem);
});

app.put('/api/problems/:id', auth, async (req, res) => {
  const { title, status, platform, timesSolved, date } = req.body;
  const updateFields = { title, status, platform, timesSolved };
  if (date && date.length > 0) updateFields.date = date;
  const problem = await Problem.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    updateFields,
    { new: true }
  );
  res.json(problem);
});

app.delete('/api/problems/:id', auth, async (req, res) => {
  await Problem.deleteOne({ _id: req.params.id, userId: req.userId });
  res.json({ success: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
