import React from 'react'

// MailerLite embedded signup form.
//
// The account-level universal.js snippet lives in index.html; here we just
// drop the form's target div. MailerLite's script watches the DOM and hydrates
// any .ml-embedded node it finds, so this works fine with client-side routing.
//
// The form ID is public — it ships in the HTML either way — so we hard-code it.
const FORM_ID = 'nv6hF7'

export default function Newsletter() {
  return (
    <section className="border-t border-gray-200 pt-8 mt-12">
      <h2 className="font-serif text-2xl font-medium mb-2">Subscribe</h2>
      <p className="text-gray-600 leading-relaxed max-w-2xl mb-4">
        Get an email whenever I publish a new post. No spam — unsubscribe anytime.
      </p>
      <div className="ml-embedded" data-form={FORM_ID}></div>
    </section>
  )
}
