import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 1. Check if the method is allowed
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { action, payload, password } = req.body;

    // 2. SECURITY CHECK: Validate Password on the Server
    const CORRECT_PASS = process.env.ADMIN_PASS;
    if (password !== CORRECT_PASS) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // 3. Connect to Supabase using the SECRET Admin Key (Not the public one)
    // You need to add SUPABASE_SERVICE_ROLE_KEY to Vercel env variables later
    const supabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let data, error;

    // 4. Perform the Action
    if (action === 'create') {
        ({ data, error } = await supabase.from('transactions').insert(payload));
    } 
    else if (action === 'update') {
        ({ data, error } = await supabase.from('transactions').update(payload).eq('id', payload.id));
    } 
    else if (action === 'delete') {
        ({ data, error } = await supabase.from('transactions').delete().eq('id', payload.id));
    }

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data });
}
