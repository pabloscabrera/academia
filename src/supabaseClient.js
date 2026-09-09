import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://slwifwjwtipoqtkhbhbr.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2lmd2p3dGlwb3F0a2hiaGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NjA0OTcsImV4cCI6MjEwNDUzNjQ5N30.1doJMfmoNSSl5L6bPWrjVSfwWATewbpKlZIBl3u33EM'

export const supabase = createClient(supabaseUrl, supabaseKey)
