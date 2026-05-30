const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'f8e7d6c5b4a392817065f4e3d2c1b0a9f8e7d6c5b4a392817065f4e3d2c1b0a9',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Store suggestions in memory (use a database in production)
let suggestions = [];

// Admin credentials (in production, use database)
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'admin',
  passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'selovasx2024', 10)
};

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized. Please login first.' });
};

// ============= PUBLIC API ENDPOINTS =============

// POST - Submit a suggestion (public endpoint)
// NOW ONLY name and message are required; email & category are optional
app.post('/api/suggestions', (req, res) => {
  try {
    const { name, email, message, category } = req.body;

    // Validate required fields: name and message
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.trim().length < 10) {
      return res.status(400).json({ error: 'Message must be at least 10 characters' });
    }

    const suggestion = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email ? email.trim() : 'Not provided',
      message: message.trim(),
      category: category || 'General',
      status: 'unread',
      createdAt: new Date().toISOString(),
      ipAddress: req.ip
    };

    suggestions.unshift(suggestion);
    
    console.log(`New suggestion received: ${suggestion.id}`);
    
    res.status(201).json({
      success: true,
      message: 'Suggestion submitted successfully',
      suggestionId: suggestion.id
    });
  } catch (error) {
    console.error('Error submitting suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET - View all suggestions (public endpoint - no auth required)
app.get('/api/suggestions', (req, res) => {
  try {
    const { status, category } = req.query;
    
    let filteredSuggestions = [...suggestions];
    
    if (status) {
      filteredSuggestions = filteredSuggestions.filter(s => s.status === status);
    }
    if (category) {
      filteredSuggestions = filteredSuggestions.filter(s => s.category === category);
    }
    
    // Only return safe fields
    const safeSuggestions = filteredSuggestions.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      message: s.message,
      category: s.category,
      status: s.status,
      createdAt: s.createdAt
    }));
    
    res.json({
      success: true,
      total: safeSuggestions.length,
      suggestions: safeSuggestions
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET - View single suggestion by ID (public endpoint - no auth required)
app.get('/api/suggestions/:id', (req, res) => {
  try {
    const suggestion = suggestions.find(s => s.id === req.params.id);
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    const safeSuggestion = {
      id: suggestion.id,
      name: suggestion.name,
      email: suggestion.email,
      message: suggestion.message,
      category: suggestion.category,
      status: suggestion.status,
      createdAt: suggestion.createdAt
    };
    res.json({ success: true, suggestion: safeSuggestion });
  } catch (error) {
    console.error('Error fetching suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============= ADMIN AUTH ENDPOINTS =============

app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username !== ADMIN_CREDENTIALS.username) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const isValidPassword = bcrypt.compareSync(password, ADMIN_CREDENTIALS.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.isAdmin = true;
    req.session.username = username;
    req.session.loginTime = new Date().toISOString();
    console.log(`Admin login successful: ${username}`);
    res.json({ success: true, message: 'Login successful', username: username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/logout', isAuthenticated, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not log out' });
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/api/admin/check-auth', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ isAuthenticated: true, username: req.session.username });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// ============= ADMIN SUGGESTION MANAGEMENT ENDPOINTS =============

app.get('/api/admin/suggestions', isAuthenticated, (req, res) => {
  try {
    const { status, category } = req.query;
    let filteredSuggestions = [...suggestions];
    if (status) {
      filteredSuggestions = filteredSuggestions.filter(s => s.status === status);
    }
    if (category) {
      filteredSuggestions = filteredSuggestions.filter(s => s.category === category);
    }
    res.json({
      success: true,
      total: filteredSuggestions.length,
      suggestions: filteredSuggestions
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/suggestions/:id', isAuthenticated, (req, res) => {
  try {
    const suggestion = suggestions.find(s => s.id === req.params.id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    res.json({ success: true, suggestion });
  } catch (error) {
    console.error('Error fetching suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/admin/suggestions/:id', isAuthenticated, (req, res) => {
  try {
    const { status } = req.body;
    const suggestionIndex = suggestions.findIndex(s => s.id === req.params.id);
    if (suggestionIndex === -1) return res.status(404).json({ error: 'Suggestion not found' });
    if (status && !['unread', 'read', 'archived', 'responded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    suggestions[suggestionIndex] = {
      ...suggestions[suggestionIndex],
      status: status || suggestions[suggestionIndex].status,
      updatedAt: new Date().toISOString()
    };
    res.json({ success: true, message: 'Suggestion updated', suggestion: suggestions[suggestionIndex] });
  } catch (error) {
    console.error('Error updating suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/suggestions/:id', isAuthenticated, (req, res) => {
  try {
    const suggestionIndex = suggestions.findIndex(s => s.id === req.params.id);
    if (suggestionIndex === -1) return res.status(404).json({ error: 'Suggestion not found' });
    suggestions.splice(suggestionIndex, 1);
    res.json({ success: true, message: 'Suggestion deleted' });
  } catch (error) {
    console.error('Error deleting suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/statistics', isAuthenticated, (req, res) => {
  try {
    const stats = {
      total: suggestions.length,
      unread: suggestions.filter(s => s.status === 'unread').length,
      read: suggestions.filter(s => s.status === 'read').length,
      archived: suggestions.filter(s => s.status === 'archived').length,
      responded: suggestions.filter(s => s.status === 'responded').length,
      categories: {}
    };
    suggestions.forEach(s => {
      stats.categories[s.category] = (stats.categories[s.category] || 0) + 1;
    });
    res.json({ success: true, statistics: stats });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Suggestion System Server running on http://localhost:${PORT}`);
  console.log(`📋 Admin panel: http://localhost:${PORT}/admin`);
  console.log(`🔑 Login: ${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
  console.log(`\n📡 Public API:`);
  console.log(`   GET  /api/suggestions - View all suggestions`);
  console.log(`   GET  /api/suggestions/:id - View single suggestion`);
  console.log(`   POST /api/suggestions - Submit new suggestion (name & message required)`);
});
