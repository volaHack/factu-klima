import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // YYYY-MM-DD

    if (!date) {
        return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    const apiKey = process.env.CAL_COM_API_KEY;
    const eventTypeId = process.env.CAL_COM_EVENT_TYPE_ID;

    if (!apiKey || !eventTypeId) {
        return NextResponse.json({ slots: [] });
    }

    // Rechazar fechas con año inválido (el input envía años parciales mientras el usuario escribe)
    const year = parseInt(date.split("-")[0], 10);
    if (year < 2024 || year > 2030) {
        return NextResponse.json({ slots: [] });
    }

    const startTime = `${date}T00:00:00.000Z`;
    const endTime = `${date}T23:59:59.000Z`;

    // Endpoint correcto: /v2/slots con parámetros start/end
    const url = `https://api.cal.com/v2/slots?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&eventTypeId=${eventTypeId}`;

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "cal-api-version": "2024-09-04",
            },
        });

        if (!response.ok) {
            console.error("Cal.com slots error:", await response.text());
            return NextResponse.json({ slots: [] });
        }

        const data = await response.json();

        // Cal.com devuelve: { data: { [date]: [{ time: "2026-03-15T09:00:00.000Z" }] } }
        const dateSlots = data?.data?.[date] ?? [];
        const slots: string[] = dateSlots.map((slot: { start: string }) => {
            const d = new Date(slot.start);
            return d.toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Madrid",
            });
        });

        return NextResponse.json({ slots });
    } catch (err) {
        console.error("Slots fetch error:", err);
        return NextResponse.json({ slots: [] });
    }
}
