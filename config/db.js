// config/db.js - Updated with better environment handling

const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');
const { metrics } = require('../middleware/prometheusMiddleware');

// Track MongoDB operations for monitoring
const trackDbOperation = (operation, collection, success) => {
  // Increment database operations counter in Prometheus metrics
  metrics.dbOperationsTotal.inc({
    operation,
    collection,
    status: success ? 'success' : 'failure'
  });
};

// Setup MongoDB connection monitoring
const setupMongooseMonitoring = () => {
  const connection = mongoose.connection;
  
  // Log all MongoDB events
  connection.on('connected', () => {
    logger.info('MongoDB connected successfully', {
      environment: config.env, 
      database: connection.name
    });
  });
  
  connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected', {
      environment: config.env
    });
  });
  
  connection.on('error', (err) => {
    logger.error('MongoDB connection error', { 
      error: err.message, 
      stack: err.stack,
      environment: config.env
    });
  });
  
  connection.on('reconnected', () => {
    logger.info('MongoDB reconnected', {
      environment: config.env
    });
  });
  
  // Monitor Mongoose operations - could be extended further if needed
  mongoose.plugin((schema) => {
    // Add hooks to track operations
    ['save', 'findOne', 'find', 'update', 'remove'].forEach((operation) => {
      schema.pre(operation, function() {
        const collection = this.constructor.modelName || 'unknown';
        logger.debug(`MongoDB ${operation} operation started`, { collection });
      });
      
      schema.post(operation, function(result) {
        const collection = this.constructor.modelName || 'unknown';
        logger.debug(`MongoDB ${operation} operation completed`, { 
          collection,
          success: !!result
        });
        trackDbOperation(operation, collection, !!result);
      });
      
      schema.post(operation, function(error) {
        if (error) {
          const collection = this.constructor.modelName || 'unknown';
          logger.error(`MongoDB ${operation} operation failed`, { 
            collection,
            error: error.message,
            stack: error.stack
          });
          trackDbOperation(operation, collection, false);
        }
      });
    });
  });
};

const connectDB = async () => {
  try {
    // Setup monitoring before connecting
    setupMongooseMonitoring();
    
    // Ensure we have a valid URI
    if (!config.db.uri) {
      throw new Error(`No MongoDB URI defined for environment: ${config.env}`);
    }
    
    // Connect to MongoDB with enhanced logging
    logger.info('Connecting to MongoDB', { 
      uri: config.db.uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'), // Hide credentials in logs
      environment: config.env
    });
    
    await mongoose.connect(config.db.uri, config.db.options);
    
    logger.info('MongoDB connected successfully', { 
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      environment: config.env
    });
    
    // Get some basic MongoDB stats
    const stats = await mongoose.connection.db.stats();
    logger.debug('MongoDB stats', { 
      collections: stats.collections,
      objects: stats.objects,
      avgObjSize: stats.avgObjSize,
      dataSize: `${(stats.dataSize / (1024 * 1024)).toFixed(2)} MB`,
      storageSize: `${(stats.storageSize / (1024 * 1024)).toFixed(2)} MB`,
      environment: config.env
    });
    
  } catch (error) {
    logger.error('MongoDB connection error', { 
      error: error.message, 
      stack: error.stack,
      environment: config.env
    });
    process.exit(1);
  }
};

module.exports = connectDB;
