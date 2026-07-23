import React from 'react'

const SIGNUP_URL = 'https://preview.mailerlite.io/forms/2527715/193781793885783523/share'

export default function Newsletter() {
  return (
    <section className="border-t border-gray-200 pt-8 mt-12">
      <h2 className="font-serif text-2xl font-medium mb-2">Subscribe</h2>
      <p className="text-gray-600 leading-relaxed max-w-2xl mb-4">
        Get an email whenever I publish a new post. No spam — unsubscribe anytime.
      </p>
      <a
        href={SIGNUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
      >
        Subscribe by email
      </a>
    </section>
  )
}
