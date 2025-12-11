export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { user, pass } = req.body;

    // These process.env variables will be set in Vercel Dashboard
    // This code runs on the SERVER, so users cannot see it.
    const CORRECT_USER = process.env.ADMIN_USER;
    const CORRECT_PASS = process.env.ADMIN_PASS;

    if (user === CORRECT_USER && pass === CORRECT_PASS) {
        return res.status(200).json({ success: true });
    } else {
        return res.status(401).json({ success: false });
    }
}