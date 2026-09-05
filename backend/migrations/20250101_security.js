// MongoDB migration script for security enhancements

// Add new fields to existing users for email verification tracking
db.users.updateMany(
  {},
  {
    $set: {
      email_verified: false,
      verification_token: null,
      verification_token_expires: null,
      password_updated_at: new Date(),
    },
  },
);

// Create collection to track login attempts and lockouts
db.createCollection('login_attempts');
db.login_attempts.createIndex({ email: 1 }, { unique: true });
db.login_attempts.createIndex({ locked_until: 1 }, { expireAfterSeconds: 0 });
