import React from 'react'

const SIGNUP_URL = 'https://preview.mailerlite.io/forms/2527715/193781793885783523/share'

export default function Newsletter() {
  return (
    <section className="border-t border-gray-200 pt-5 mt-10">
      <h2 className="font-serif text-lg font-medium mb-1">Subscribe</h2>
      <p className="text-sm text-gray-600 leading-relaxed max-w-xl mb-3">
        Get an email whenever I publish a new post. No spam — unsubscribe anytime.
      </p>
      <a
        href={SIGNUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        Subscribe by email
      </a>
    </section>
  )
}
