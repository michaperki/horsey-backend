const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { closeDatabase, clearDatabase, connect } = require('./setup');

let app; // Declare app here

describe('Admin Authentication Routes', () => {
  let adminToken;
  let nonAdminToken;
  let adminUser;
  let nonAdminUser;

  // Initialize the in-memory database and app before all tests
  beforeAll(async () => {
    await connect();

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in the environment variables.');
    }

    // Create an admin user
    const hashedPasswordAdmin = await bcrypt.hash('adminpass', 10);
    adminUser = await User.create({
      username: 'adminuser',
      email: 'admin@example.com',
      password: hashedPasswordAdmin,
      role: 'admin',
    });

    adminToken = jwt.sign(
      { id: adminUser._id, username: adminUser.username, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create a non-admin user
    const hashedPasswordUser = await bcrypt.hash('userpass', 10);
    nonAdminUser = await User.create({
      username: 'regularuser',
      email: 'user@example.com',
      password: hashedPasswordUser,
      role: 'user',
    });

    nonAdminToken = jwt.sign(
      { id: nonAdminUser._id, username: nonAdminUser.username, role: nonAdminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    app = require('../server');
  });

  // Clear the database after each test to ensure test isolation
  afterEach(async () => {
    await clearDatabase();

    const hashedPasswordAdmin = await bcrypt.hash('adminpass', 10);
    adminUser = await User.create({
      username: 'adminuser',
      email: 'admin@example.com',
      password: hashedPasswordAdmin,
      role: 'admin',
    });

    adminToken = jwt.sign(
      { id: adminUser._id, username: adminUser.username, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const hashedPasswordUser = await bcrypt.hash('userpass', 10);
    nonAdminUser = await User.create({
      username: 'regularuser',
      email: 'user@example.com',
      password: hashedPasswordUser,
      role: 'user',
    });

    nonAdminToken = jwt.sign(
      { id: nonAdminUser._id, username: nonAdminUser.username, role: nonAdminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  // Close the database connection after all tests
  afterAll(async () => {
    await closeDatabase();
  });

  describe('POST /auth/admin/login', () => {
    it('should login admin successfully', async () => {
      const res = await request(app)
        .post('/auth/admin/login')
        .send({
          email: 'admin@example.com',
          password: 'adminpass',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Admin login successful');
      expect(res.body).toHaveProperty('token');

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
          password: 'wrongpass',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should not login non-existent admin', async () => {
      const res = await request(app)
        .post('/auth/admin/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'adminpass',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/auth/admin/login')
        .send({
          email: 'admin@example.com'
          // Missing password
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Email and password are required');
    });
  });

  describe('POST /auth/admin/register', () => {
    it('should register a new admin successfully', async () => {
      const res = await request(app)
        .post('/auth/admin/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'newadmin',
          email: 'newadmin@example.com',
          password: 'newadminpass',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('message', 'Admin registered successfully');

      const admin = await User.findOne({ email: 'newadmin@example.com' });
      expect(admin).toBeTruthy();
      expect(admin.username).toBe('newadmin');
      expect(admin.role).toBe('admin');
    });

    it('should not register a new admin without authentication', async () => {
      const res = await request(app)
        .post('/auth/admin/register')
        // No Authorization header
        .send({
          username: 'newadmin',
          email: 'newadmin@example.com',
          password: 'newadminpass',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Access denied. No token provided.');
    });

    it('should not register a new admin without admin role', async () => {
      const res = await request(app)
        .post('/auth/admin/register')
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .send({
          username: 'anotheradmin',
          email: 'anotheradmin@example.com',
          password: 'anotheradminpass',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('message', 'Access denied. Insufficient permissions.');
    });

    it('should not register a new admin with missing fields', async () => {
      const res = await request(app)
        .post('/auth/admin/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          // Missing email and password
          username: 'incompleteadmin',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'All fields are required');
    });

    it('should not register a new admin with existing email', async () => {
      // First registration
      await request(app)
        .post('/auth/admin/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'existingadmin',
          email: 'existingadmin@example.com',
          password: 'password123',
        });

      // Attempt duplicate registration
      const res = await request(app)
        .post('/auth/admin/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'newadmin2',
          email: 'existingadmin@example.com', // Duplicate email
          password: 'password456',
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body).toHaveProperty('message', 'Username or email already in use');
    });

    it('should not register a new admin with existing username', async () => {
      // First registration
      await request(app)
        .post('/auth/admin/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'duplicateadmin',
          email: 'duplicateadmin1@example.com',
          password: 'password123',
        });

      // Attempt duplicate registration
      const res = await request(app)
        .post('/auth/admin/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'duplicateadmin', // Duplicate username
          email: 'duplicateadmin2@example.com',
          password: 'password456',
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body).toHaveProperty('message', 'Username or email already in use');
    });

    it('should handle server errors gracefully during registration', async () => {
      // Mock User.prototype.save to throw an error
      const originalSave = User.prototype.save;
      User.prototype.save = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app)
        .post('/auth/admin/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'erroradmin',
          email: 'erroradmin@example.com',
          password: 'errorpass',
        });

      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('message', 'Database error');

      // Restore the original implementation
      User.prototype.save = originalSave;
    });
  });
});

