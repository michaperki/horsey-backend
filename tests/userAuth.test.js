// backend/tests/userAuth.test.js
const bcrypt = require('bcrypt'); // Add this line
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../server'); // Import the Express app
const mongoose = require('mongoose');
const User = require('../models/User');

jest.mock('../services/emailService'); // Uses __mocks__/emailService.js

describe('POST /auth/register', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'testuser',
        email: 'testuser@example.com',
        password: 'password123',
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('message', 'User registered successfully');

    // Verify user is in the database
    const user = await User.findOne({ email: 'testuser@example.com' });
    expect(user).toBeTruthy();
    expect(user.username).toBe('testuser');
  });

  it('should not register a user with existing email', async () => {
    // First registration
    await request(app)
      .post('/auth/register')
      .send({
        username: 'user1',
        email: 'duplicate@example.com',
        password: 'password123',
      });

    // Attempt duplicate registration
    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'user2',
        email: 'duplicate@example.com',
        password: 'password456',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Username or email already in use');
  });

  it('should not register a user with missing fields', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: 'incomplete@example.com',
        password: 'password123',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'All fields are required');
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    await User.create({
      username: 'loginuser',
      email: 'loginuser@example.com',
      password: hashedPassword,
    });
  });

  it('should login an existing user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'loginuser@example.com',
        password: 'password123',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');

    // Optionally, verify the token
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded).toHaveProperty('id');
    expect(decoded).toHaveProperty('username', 'loginuser');
    expect(decoded).toHaveProperty('role', 'user');
  });

  it('should not login with incorrect password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'loginuser@example.com',
        password: 'wrongpassword',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
  });

  it('should not login a non-existent user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password123',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
  });

  it('should not login with missing fields', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'loginuser@example.com',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Email and password are required');
  });
});
