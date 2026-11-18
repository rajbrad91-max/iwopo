/**
 * 🏷️ Payment statuses — their names and icons, shared by leads, bookings and the dashboard.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 * The icons sit beside the status, not in the dropdown (Raj, 2026-11-17): our Leads icon, our Packages icon with an arrow
 * going out, and the tick (assets/nav, shown with NavIcon).
 */


export const STATUSES = ['new', 'quoted', 'booked'];
export const S_ICON = { new: 'leads', quoted: 'packages-send', booked: 'yes' };
export const S_LABEL = { new: 'New', quoted: 'Package Sent', booked: 'Booking Confirmed' };
