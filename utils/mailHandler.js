const CronLog = require("../models/cronLogModel");
const Resend = require("resend").Resend;
const resend = new Resend(process.env.RESEND_API_KEY);


// ======================
// SENDMAIL (Password reset)
// ======================
const SENDMAIL = async (email, subject, text) => {
    try {
        const htmlContent = `
            <p>Please click on the link below to reset your password:</p>
            <p><a href="${text}" target="_blank">${text}</a></p>
            <p><strong>Note:</strong> The link expires in one hour.</p>
        `;

        const response = await resend.emails.send({
            from: `Support Team at Riyad <noreply@${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: htmlContent
        });

        if (response.error) {
            console.error("Email Sending Error:", response.error);
        } else {
            console.log("Reset password email sent:", response.data);
        }

    } catch (error) {
        console.log("Reset password email failed:", error);
    }
};


// ======================
// SEND NOTIFICATION TO SPERADMINS ON UNMARKED ATTENDANCE
// ======================
const SEND_NOTIFICATION_EMAIL = async (
    email,
    subject,
    html,
    meta = {}
) => {
    try {
        const type = meta.type;
        if (!type) {
            console.log("Missing email type (daily/weekly)");
            return;
        }
        const programme = meta.programme || "default";
        const dateKey = meta.dateKey || null;
        const weekKey = meta.weekKey || null;

        const emailKey = `${type}:${programme}:${dateKey || weekKey || "global"}`;

        // ===============================
        // 🛑 IDEMPOTENCY CHECK (BLOCK DUPLICATES)
        // ===============================
        const exists = await CronLog.findOne({ emailKey });

        if (exists) {
            console.log("⚠️ Duplicate email blocked:", emailKey);
            return;
        }

        // ===============================
        // SEND EMAIL
        // ===============================
        const response = await resend.emails.send({
            from: `Riyad Madrasah Mgt System <support@${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: html
        });

        if (response.error) {
            console.error("Notification email error:", response.error);
            return;
        }

        console.log("✅ Notification email sent:", response.data);

        // ===============================
        // LOCK IT IN DB (PREVENT RE-SEND)
        // ===============================
        await CronLog.create({
            type,
            programme,
            dateKey,
            weekKey,
            emailKey,
            status: "success"
        });

    } catch (error) {
        console.log("Notification email failed:", error);
    }
};


// ======================
// GETMAIL (Contact form)
// ======================
const GETMAIL = async (fullname, email, phone, subject, message) => {
    try {
        const htmlContent = `
            <p><strong>Message:</strong></p>
            <p>${message}</p>
            <hr/>
            <p><strong>Sender Details</strong></p>
            <p><strong>Name:</strong> ${fullname}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || "N/A"}</p>
        `;

        const response = await resend.emails.send({
            from: `Riyad Madrasah <contact@${process.env.EMAIL_USER}>`,
            to: process.env.GETMAIL_USER,
            replyTo: email,
            subject,
            html: htmlContent
        });

        if (response.error) {
            console.log("RESEND ERROR:", response.error);
            return false;
        }
        return true;

    } catch (error) {
        console.log("RESEND EXCEPTION:", error);
        return false;
    }
};


module.exports = { SENDMAIL, GETMAIL, SEND_NOTIFICATION_EMAIL };






