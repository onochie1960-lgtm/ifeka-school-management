# Ifeka School Management — Starter Application

This is the first application layer for the existing Ifeka School Management Supabase database.

## Files
- index.html — application interface
- style.css — responsive design
- config.js — Supabase connection settings
- app.js — database connection and generic record viewer

## Setup
1. Open `config.js`.
2. Replace the two placeholders with your Supabase Project URL and PUBLIC anon key.
3. Do NOT use the `service_role`/secret key in a browser application.
4. Upload the four files to your web hosting or static hosting.

## Current stage
The app reads the existing tables:
Students, attendance, fee_payments, parents, results, school_classes, student_parents, subjects, teachers.

The next development stage is to add:
- secure staff login
- proper Student/Teacher/Parent forms
- attendance entry
- results entry and report cards
- fee receipts and payment history
- parent portal
- teacher portal
- role-based permissions
- dashboard charts and school settings

The generic editor is deliberately conservative because some tables are empty and their exact column constraints should be configured before writing data into them.
