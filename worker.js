const MAX_IMAGE_SIZE = 7 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
]);

const REVIEWERS = new Set([
    "ผู้ตรวจสอบทั้งหมด",
    "หัวลีด",
    "รองลีด",
    "เลขา"
]);

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}

function safeText(value, maxLength = 1500) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
}

function validAge(value) {
    const age = Number(value);
    return Number.isInteger(age) && age >= 1 && age <= 999;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Max-Age": "86400"
                }
            });
        }

        if (request.method !== "POST") {
            return jsonResponse({
                error: "Method not allowed"
            }, 405);
        }

        if (!env.DISCORD_WEBHOOK_URL) {
            return jsonResponse({
                error: "ยังไม่ได้ตั้งค่า Discord Webhook"
            }, 500);
        }

        if (url.pathname !== "/") {
            return jsonResponse({
                error: "Not found"
            }, 404);
        }

        const contentLength = Number(
            request.headers.get("Content-Length") || 0
        );

        if (contentLength > MAX_IMAGE_SIZE + 100_000) {
            return jsonResponse({
                error: "ไฟล์มีขนาดใหญ่เกินไป"
            }, 413);
        }

        try {
            const incoming = await request.formData();

            const rawApplication = incoming.get("application");
            const image = incoming.get("characterImage");

            if (typeof rawApplication !== "string" || !image) {
                return jsonResponse({
                    error: "ข้อมูลใบสมัครหรือรูปภาพไม่ครบ"
                }, 400);
            }

            if (
                typeof image === "string" ||
                typeof image.arrayBuffer !== "function"
            ) {
                return jsonResponse({
                    error: "รูปภาพไม่ถูกต้อง"
                }, 400);
            }

            if (image.size <= 0 || image.size > MAX_IMAGE_SIZE) {
                return jsonResponse({
                    error: "รูปภาพต้องมีขนาดไม่เกิน 7 MB"
                }, 400);
            }

            if (!ALLOWED_TYPES.has(image.type)) {
                return jsonResponse({
                    error: "รองรับเฉพาะ JPG, PNG และ WEBP"
                }, 400);
            }

            let raw;

            try {
                raw = JSON.parse(rawApplication);
            } catch {
                return jsonResponse({
                    error: "ข้อมูลใบสมัครมีรูปแบบไม่ถูกต้อง"
                }, 400);
            }

            const data = {
                icName: safeText(raw.icName, 60),
                ocName: safeText(raw.ocName, 60),
                icAge: String(raw.icAge ?? ""),
                ocAge: String(raw.ocAge ?? ""),
                role: safeText(raw.role, 20),
                reason: safeText(raw.reason, 1500),
                weapons: safeText(raw.weapons, 1000) || "ไม่มี",
                reviewer: safeText(raw.reviewer, 60)
            };

            if (
                !data.icName ||
                !data.ocName ||
                !validAge(data.icAge) ||
                !validAge(data.ocAge) ||
                !["Story", "Farm"].includes(data.role) ||
                !data.reason ||
                !REVIEWERS.has(data.reviewer)
            ) {
                return jsonResponse({
                    error: "กรุณาตรวจสอบข้อมูลใบสมัครให้ถูกต้อง"
                }, 400);
            }

            const embed = {
                title: "📋 ใบสมัครเข้าแก๊ง Neo Eclipse [NE]",
                color: 1492479,
                fields: [
                    {
                        name: "👤 ชื่อ IC",
                        value: data.icName,
                        inline: true
                    },
                    {
                        name: "💻 ชื่อ OC",
                        value: data.ocName,
                        inline: true
                    },
                    {
                        name: "🎂 อายุ IC / OC",
                        value: `${data.icAge} ปี / ${data.ocAge} ปี`,
                        inline: true
                    },
                    {
                        name: "🎯 สายที่สมัคร",
                        value: data.role,
                        inline: true
                    },
                    {
                        name: "📢 ผู้ตรวจสอบ",
                        value: data.reviewer,
                        inline: true
                    },
                    {
                        name: "📝 สาเหตุที่อยากเข้า",
                        value: data.reason || "-",
                        inline: false
                    },
                    {
                        name: "⚔️ อาวุธที่มี",
                        value: data.weapons || "ไม่มี",
                        inline: false
                    },
                    {
                        name: "📎 รูปตัวละคร",
                        value: "แนบรูปไว้ในข้อความนี้แล้ว",
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: "Neo Eclipse Recruitment System"
                }
            };

            const discordForm = new FormData();

            discordForm.append(
                "payload_json",
                JSON.stringify({
                    content: `📢 มีผู้สมัครเข้าแก๊ง Neo Eclipse ใหม่!\nผู้ตรวจสอบ: ${data.reviewer}`,
                    embeds: [embed],
                    allowed_mentions: {
                        parse: []
                    }
                })
            );

            discordForm.append(
                "files[0]",
                image,
                image.name || "character-image"
            );

            const discordResponse = await fetch(
                env.DISCORD_WEBHOOK_URL + "?wait=true",
                {
                    method: "POST",
                    body: discordForm
                }
            );

            if (!discordResponse.ok) {
                return jsonResponse({
                    error: "Discord ปฏิเสธการส่งข้อมูล กรุณาตรวจสอบ Webhook"
                }, 502);
            }

            return jsonResponse({
                success: true,
                message: "ส่งใบสมัครเรียบร้อยแล้ว"
            });

        } catch (error) {
            return jsonResponse({
                error: "เกิดข้อผิดพลาดระหว่างส่งใบสมัคร"
            }, 500);
        }
    }
};
