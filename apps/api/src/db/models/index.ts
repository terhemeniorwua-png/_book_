import {
  AdminAccount,
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
  BookingStatusEvent,
  ContactInquiry,
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

export {
  AdminAccount,
  Amenity,
  Apartment,
  ApartmentAmenity,
  ApartmentCharge,
  ApartmentImage,
  AvailabilityBlock,
  Booking,
  BookingStatusEvent,
  ContactInquiry,
  Guest,
  InventoryClaim,
  PaymentTransaction,
  PaymentWebhookEvent,
  PaymentStateEvent,
};
