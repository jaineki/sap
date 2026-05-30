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
  secret: process.env.SESSION_SECRET || 'f8e7d6c5b4a392817065f4e3d2c1b0af8e7d6c5b4a392817065f4e3d2c1b0a9',
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
  // Hash password on startup
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

// Submit a suggestion (public endpoint - can be used from any website)
app.post('/api/suggestions', (req, res) => {
  try {
    const { name, email, message, category } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const suggestion = {
      id: Date.now().toString(),
      name: name || 'Anonymous',
      email: email || 'Not provided',
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

// ============= ADMIN AUTH ENDPOINTS =============

// Login endpoint
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Verify credentials
    if (username !== ADMIN_CREDENTIALS.username) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = bcrypt.compareSync(password, ADMIN_CREDENTIALS.passwordHash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session
    req.session.isAdmin = true;
    req.session.username = username;
    req.session.loginTime = new Date().toISOString();

    console.log(`Admin login successful: ${username}`);
    
    res.json({
      success: true,
      message: 'Login successful',
      username: username
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint
app.post('/api/admin/logout', isAuthenticated, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Check auth status
app.get('/api/admin/check-auth', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ 
      isAuthenticated: true, 
      username: req.session.username 
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// ============= ADMIN SUGGESTION MANAGEMENT ENDPOINTS =============

// Get all suggestions (admin only)
app.get('/api/admin/suggestions', isAuthenticated, (req, res) => {
  try {
    const { status, category, page = 1, limit = 20 } = req.query;
    
    let filteredSuggestions = [...suggestions];
    
    // Filter by status
    if (status) {
      filteredSuggestions = filteredSuggestions.filter(s => s.status === status);
    }
    
    // Filter by category
    if (category) {
      filteredSuggestions = filteredSuggestions.filter(s => s.category === category);
    }
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedSuggestions = filteredSuggestions.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      total: filteredSuggestions.length,
      page: parseInt(page),
      totalPages: Math.ceil(filteredSuggestions.length / limit),
      suggestions: paginatedSuggestions
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single suggestion (admin only)
app.get('/api/admin/suggestions/:id', isAuthenticated, (req, res) => {
  try {
    const suggestion = suggestions.find(s => s.id === req.params.id);
    
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    res.json({ success: true, suggestion });
  } catch (error) {
    console.error('Error fetching suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update suggestion status (admin only)
app.patch('/api/admin/suggestions/:id', isAuthenticated, (req, res) => {
  try {
    const { status } = req.body;
    const suggestionIndex = suggestions.findIndex(s => s.id === req.params.id);
    
    if (suggestionIndex === -1) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    if (status && !['unread', 'read', 'archived', 'responded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    suggestions[suggestionIndex] = {
      ...suggestions[suggestionIndex],
      status: status || suggestions[suggestionIndex].status,
      updatedAt: new Date().toISOString()
    };
    
    res.json({ 
      success: true, 
      message: 'Suggestion updated',
      suggestion: suggestions[suggestionIndex]
    });
  } catch (error) {
    console.error('Error updating suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete suggestion (admin only)
app.delete('/api/admin/suggestions/:id', isAuthenticated, (req, res) => {
  try {
    const suggestionIndex = suggestions.findIndex(s => s.id === req.params.id);
    
    if (suggestionIndex === -1) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    suggestions.splice(suggestionIndex, 1);
    
    res.json({ success: true, message: 'Suggestion deleted' });
  } catch (error) {
    console.error('Error deleting suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get statistics (admin only)
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
    
    // Count by category
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
  console.log(`🔑 Login with username: ${process.env.ADMIN_USERNAME || 'admin'}`);
  console.log(`🔒 Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
  console.log(`\n📡 API Endpoints:`);
  console.log(`   POST /api/suggestions - Submit suggestion (public)`);
  console.log(`   POST /api/admin/login - Admin login`);
  console.log(`   GET /api/admin/suggestions - View all suggestions`);
  console.log(`   GET /api/admin/statistics - View statistics`);
});
