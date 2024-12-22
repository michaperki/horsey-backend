// backend/tests/adminAuth.test.js
const request = require('supertest');
const mongoose = require('mongoose'); // Ensure mongoose is imported
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { closeDatabase, clearDatabase } = require('./setup');

let app; // Declare app here

describe('Admin Authentication Routes', () => {
  let adminToken;

  beforeAll(async () => {
    // Import the app after setupTests.js has connected to in-memory DB
    app = require('../server');

    // Ensure JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in the environment variables.');
    }

    // Create an admin user
    const hashedPassword = await bcrypt.hash('adminpass', 10);
    const admin = await User.create({
      username: 'adminuser',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
    });

    console.log('Admin user created:', admin); // Debug log

    // Verify password hashing
    const isPasswordHashed = await bcrypt.compare('adminpass', admin.password);
    console.log('Is password hashed correctly:', isPasswordHashed); // Should be true

    expect(admin.role).toBe('admin'); // Ensure role is set correctly

    // Generate JWT token for admin
    adminToken = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Close the database connection
    await closeDatabase();
  });

  afterEach(async () => {
    // Clear the database after each test
    await clearDatabase();
  });

  describe('POST /auth/admin/login', () => {
    it('should login admin successfully', async () => {
      const res = await request(app)
        .post('/auth/admin/login')
        .send({
          email: 'admin@example.com',
          password: 'adminpass', // Correct password
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Admin login successful');
      expect(res.body).toHaveProperty('token');

      // Optionally, verify the token
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('id');
      expect(decoded).toHaveProperty('username', 'adminuser');
      expect(decoded).toHaveProperty('role', 'admin');
    });

    it('should not login with incorrect password', async () => {
      const res = await request(app)
        .post('/auth/admin/login')
        .send({
          email: 'admin@example.com',
          password: 'wrongpass', // Incorrect password
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should not login non-existent admin', async () => {
      const res = await request(app)
        .post('/auth/admin/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'adminpass',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/auth/admin/login')
        .send({
          email: 'admin@example.com',
          // Missing password
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Email and password are required');
    });
  });

  // ... other describe blocks
});
