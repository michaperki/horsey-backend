
// backend/routes/notification.js

const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/authMiddleware');
const { sendNotification } = require('../services/notificationService');
const mongoose = require('mongoose');

// GET /notifications
// Fetch notifications for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20, read } = req.query;

  const filter = { userId };

  if (read === 'true') filter.read = true;
  if (read === 'false') filter.read = false;

  console.log(`Fetching notifications for User ID=${userId} with filters: page=${page}, limit=${limit}, read=${read}`);

  try {
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

    const total = await Notification.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    console.log(`Fetched ${notifications.length} notifications for User ID=${userId}`);

    res.json({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages,
      notifications,
    });
  } catch (error) {
    console.error(`Error fetching notifications for User ID=${userId}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /notifications/:id/read
// Mark a specific notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const notificationId = req.params.id;

  console.log(`Marking notification ID=${notificationId} as read for User ID=${userId}`);

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    console.warn(`Invalid notification ID: ${notificationId} for User ID=${userId}`);
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      console.warn(`Notification ID=${notificationId} not found for User ID=${userId}`);
      return res.status(404).json({ error: 'Notification not found' });
    }

    console.log(`Notification ID=${notificationId} marked as read for User ID=${userId}`);

    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error(`Error updating notification ID=${notificationId} for User ID=${userId}:`, error.message);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// POST /notifications/read-all
// Mark all notifications as read for the authenticated user
router.post('/read-all', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  console.log(`Marking all notifications as read for User ID=${userId}`);

  try {
    const result = await Notification.updateMany({ userId, read: false }, { read: true });
    console.log(`Marked ${result.nModified} notifications as read for User ID=${userId}`);
    res.json({ message: 'All notifications marked as read', modifiedCount: result.nModified });
  } catch (error) {
    console.error(`Error marking all notifications as read for User ID=${userId}:`, error.message);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// POST /notifications
// Create a new notification for the authenticated user
router.post('/', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { message, type } = req.body;

  console.log(`Creating new notification for User ID=${userId}: message="${message}", type="${type}"`);

  if (!message) {
    console.warn(`Notification creation failed: Message is required for User ID=${userId}`);
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Use the sendNotification service to create and emit the notification
    await sendNotification(userId, message, type || 'other');

    console.log(`Notification created and sent successfully for User ID=${userId}`);
    res.status(201).json({ message: 'Notification created and sent successfully' });
  } catch (error) {
    console.error(`Error creating notification for User ID=${userId}:`, error.message);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

module.exports = router;

