import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

interface BookingRequest {
    name: string;
    email: string;
    phone: string;
    date: string;   // YYYY-MM-DD
    time: string;   // HH:MM (hora España)
    message: string;
}

async function createCalComBooking(booking: BookingRequest): Promise<{ bookingId: string; meetLink: string }> {
    const apiKey = process.env.CAL_COM_API_KEY;
    const eventTypeId = process.env.CAL_COM_EVENT_TYPE_ID;

    // Convertir hora local España a UTC ISO string
    // Detectar si es verano (UTC+2) o invierno (UTC+1)
    const localDateStr = `${booking.date}T${booking.time}:00`;
    const testDate = new Date(booking.date);
    const jan = new Date(testDate.getFullYear(), 0, 1);
    const jul = new Date(testDate.getFullYear(), 6, 1);
    const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    const isDST = testDate.getTimezoneOffset() < stdOffset;
    const offset = isDST ? "+02:00" : "+01:00";
    const startTime = new Date(localDateStr + offset).toISOString();

    const response = await fetch("https://api.cal.com/v2/bookings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "cal-api-version": "2024-08-13",
        },
        body: JSON.stringify({
            eventTypeId: Number(eventTypeId),
            start: startTime,
            attendee: {
                name: booking.name,
                email: booking.email,
                phoneNumber: booking.phone,
                timeZone: "Europe/Madrid",
                language: "es",
            },
            metadata: {
                project: booking.message,
            },
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error("Cal.com booking error:", text);
        throw new Error("Cal.com booking failed: " + text);
    }

    const data = await response.json();
    const bookingData = data?.data ?? data;

    return {
        bookingId: String(bookingData?.id ?? bookingData?.uid ?? ""),
        meetLink: bookingData?.meetingUrl ?? bookingData?.metadata?.videoCallUrl ?? "",
    };
}

export async function POST(req: NextRequest) {
    const body: BookingRequest = await req.json();
    const { name, email, phone, date, time, message } = body;

    if (!name || !email || !phone || !date || !time) {
        return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    let bookingId = "";
    let meetLink = "";

    // 1. Crear booking en Cal.com
    try {
        const result = await createCalComBooking(body);
        bookingId = result.bookingId;
        meetLink = result.meetLink;
    } catch (err) {
        console.error("Cal.com error:", err);
        return NextResponse.json({ error: "Error al agendar en el calendario. Inténtalo de nuevo." }, { status: 500 });
    }

    // 2. Guardar en Supabase como registro
    try {
        const supabase = await createAdminClient();
        await supabase.from("contact_messages").insert({
            name: name.trim(),
            email: email.trim(),
            company: phone.trim(),
            service_interest: "Llamada IA",
            message: `[Llamada Agendada para ${date} a las ${time}${bookingId ? ` — Cal.com ID: ${bookingId}` : ""}]\nNota: ${message || "Sin nota"}`,
        });
    } catch (err) {
        // No bloqueamos si Supabase falla — el booking en Cal.com ya existe
        console.error("Supabase insert error:", err);
    }

    return NextResponse.json({ success: true, bookingId, meetLink });
}
