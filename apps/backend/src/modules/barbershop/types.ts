export interface BarberCustomerDto { id: string; name: string; dni: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean; createdAt: string }
export interface StaffDto { id: string; name: string; phone: string | null; specialty: string | null; commissionPct: number; active: boolean; schedules: Array<{ weekday: number; startsAt: string; endsAt: string }> }
export interface ServiceDto { id: string; name: string; category: string | null; durationMinutes: number; priceCents: number; active: boolean }
export interface AppointmentDto { id: string; startsAt: string; endsAt: string; status: string; priceCents: number; notes: string | null; customer: { id: string; name: string; phone: string | null }; staff: { id: string; name: string }; service: { id: string; name: string }; paid: boolean }
export interface BarberSaleDto { id: string; code: string; paymentMethod: string; totalCents: number; createdAt: string; customer: string | null }

export interface BarbershopData {
  customers: BarberCustomerDto[];
  staff: StaffDto[];
  services: ServiceDto[];
  appointments: AppointmentDto[];
  sales: BarberSaleDto[];
  cashSession: { id: string; status: string; openingCents: number; expectedCents: number; openedAt: string } | null;
  metrics: { todayAppointments: number; confirmed: number; completed: number; todayRevenueCents: number; activeCustomers: number };
}
