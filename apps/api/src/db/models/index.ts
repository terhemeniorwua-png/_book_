import {
  AdminAccount,
  AdminSession,
  AdminAuditEvent,
  Amenity,
  Apartment,
  ApartmentAmenity,
  ApartmentCharge,
  ApartmentImage,
  AvailabilityBlock,
  Guest,
} from './catalog.js';
import {
  Booking,
  BookingCancellation,
  BookingCancellationToken,
  BookingRefund,
  BookingStatusEvent,
  ContactInquiry,
  EmailNotification,
  InventoryClaim,
  PaymentTransaction,
  PaymentWebhookEvent,
  PaymentStateEvent,
} from './reservations.js';

Apartment.belongsToMany(Amenity, {
  through: ApartmentAmenity,
  foreignKey: 'apartmentId',
  otherKey: 'amenityId',
  as: 'amenities',
});
AdminAccount.hasMany(AdminSession, {
  foreignKey: 'adminAccountId',
  as: 'sessions',
  onDelete: 'CASCADE',
});
AdminSession.belongsTo(AdminAccount, {
  foreignKey: 'adminAccountId',
  as: 'admin',
});
AdminAccount.hasMany(AdminAuditEvent, {
  foreignKey: 'adminAccountId',
  as: 'auditEvents',
});
AdminAuditEvent.belongsTo(AdminAccount, {
  foreignKey: 'adminAccountId',
  as: 'admin',
});
Amenity.belongsToMany(Apartment, {
  through: ApartmentAmenity,
  foreignKey: 'amenityId',
  otherKey: 'apartmentId',
  as: 'apartments',
});
Apartment.hasMany(ApartmentImage, {
  foreignKey: 'apartmentId',
  as: 'images',
  onDelete: 'CASCADE',
});
ApartmentImage.belongsTo(Apartment, {
  foreignKey: 'apartmentId',
  as: 'apartment',
});
Apartment.hasMany(ApartmentCharge, {
  foreignKey: 'apartmentId',
  as: 'charges',
  onDelete: 'CASCADE',
});
ApartmentCharge.belongsTo(Apartment, {
  foreignKey: 'apartmentId',
  as: 'apartment',
});
Apartment.hasMany(AvailabilityBlock, {
  foreignKey: 'apartmentId',
  as: 'availabilityBlocks',
  onDelete: 'CASCADE',
});
AvailabilityBlock.belongsTo(Apartment, {
  foreignKey: 'apartmentId',
  as: 'apartment',
});
AvailabilityBlock.belongsTo(AdminAccount, {
  foreignKey: 'createdByAdminId',
  as: 'createdBy',
});
AdminAccount.hasMany(AvailabilityBlock, {
  foreignKey: 'createdByAdminId',
  as: 'availabilityBlocksCreated',
});
Apartment.hasMany(Booking, { foreignKey: 'apartmentId', as: 'bookings' });
Booking.belongsTo(Apartment, { foreignKey: 'apartmentId', as: 'apartment' });
Guest.hasMany(Booking, { foreignKey: 'guestId', as: 'bookings' });
Booking.belongsTo(Guest, { foreignKey: 'guestId', as: 'guest' });
Booking.hasMany(PaymentTransaction, {
  foreignKey: 'bookingId',
  as: 'paymentTransactions',
});
PaymentTransaction.hasMany(PaymentStateEvent, {
  foreignKey: 'paymentTransactionId',
  as: 'stateEvents',
});
PaymentStateEvent.belongsTo(PaymentTransaction, {
  foreignKey: 'paymentTransactionId',
  as: 'paymentTransaction',
});
PaymentTransaction.belongsTo(Booking, {
  foreignKey: 'bookingId',
  as: 'booking',
});
Booking.hasMany(BookingStatusEvent, {
  foreignKey: 'bookingId',
  as: 'statusEvents',
});
BookingStatusEvent.belongsTo(Booking, {
  foreignKey: 'bookingId',
  as: 'booking',
});
BookingStatusEvent.belongsTo(AdminAccount, {
  foreignKey: 'actorAdminId',
  as: 'actor',
});
AdminAccount.hasMany(BookingStatusEvent, {
  foreignKey: 'actorAdminId',
  as: 'bookingStatusEvents',
});
Booking.hasOne(InventoryClaim, {
  foreignKey: 'bookingId',
  as: 'inventoryClaim',
});
InventoryClaim.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
AvailabilityBlock.hasOne(InventoryClaim, {
  foreignKey: 'availabilityBlockId',
  as: 'inventoryClaim',
});
InventoryClaim.belongsTo(AvailabilityBlock, {
  foreignKey: 'availabilityBlockId',
  as: 'availabilityBlock',
});
Apartment.hasMany(InventoryClaim, {
  foreignKey: 'apartmentId',
  as: 'inventoryClaims',
});
Booking.hasMany(BookingCancellationToken, {
  foreignKey: 'bookingId',
  as: 'cancellationTokens',
});
BookingCancellationToken.belongsTo(Booking, {
  foreignKey: 'bookingId',
  as: 'booking',
});
Booking.hasOne(BookingCancellation, {
  foreignKey: 'bookingId',
  as: 'cancellation',
});
BookingCancellation.belongsTo(Booking, {
  foreignKey: 'bookingId',
  as: 'booking',
});
BookingCancellation.belongsTo(BookingCancellationToken, {
  foreignKey: 'tokenId',
  as: 'token',
});
BookingCancellationToken.hasMany(BookingCancellation, {
  foreignKey: 'tokenId',
  as: 'cancellations',
});
Booking.hasOne(BookingRefund, {
  foreignKey: 'bookingId',
  as: 'refund',
});
BookingRefund.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
BookingCancellation.hasOne(BookingRefund, {
  foreignKey: 'cancellationId',
  as: 'refund',
});
BookingRefund.belongsTo(BookingCancellation, {
  foreignKey: 'cancellationId',
  as: 'cancellation',
});
PaymentTransaction.hasOne(BookingRefund, {
  foreignKey: 'paymentTransactionId',
  as: 'refund',
});
BookingRefund.belongsTo(PaymentTransaction, {
  foreignKey: 'paymentTransactionId',
  as: 'payment',
});
Booking.hasMany(EmailNotification, {
  foreignKey: 'bookingId',
  as: 'emailNotifications',
});
EmailNotification.belongsTo(Booking, {
  foreignKey: 'bookingId',
  as: 'booking',
});
BookingCancellation.hasMany(EmailNotification, {
  foreignKey: 'cancellationId',
  as: 'emailNotifications',
});
EmailNotification.belongsTo(BookingCancellation, {
  foreignKey: 'cancellationId',
  as: 'cancellation',
});

export {
  AdminAccount,
  AdminSession,
  AdminAuditEvent,
  Amenity,
  Apartment,
  ApartmentAmenity,
  ApartmentCharge,
  ApartmentImage,
  AvailabilityBlock,
  Booking,
  BookingCancellation,
  BookingCancellationToken,
  BookingRefund,
  BookingStatusEvent,
  ContactInquiry,
  EmailNotification,
  Guest,
  InventoryClaim,
  PaymentTransaction,
  PaymentWebhookEvent,
  PaymentStateEvent,
};
