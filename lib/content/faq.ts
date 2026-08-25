/**
 * Questions shown on the public landing page.
 *
 * Kept in domain-adjacent content so the same wording can be emitted as
 * FAQPage JSON-LD without duplicating copy. The answers stay factual and do
 * not promise deletion.
 */
export interface PublicFaqItem {
  id: string;
  question: string;
  answer: string;
}

export const PUBLIC_FAQ_ITEMS: readonly PublicFaqItem[] = [
  {
    id: "cost",
    question: "Do I have to pay for anything?",
    answer:
      "No. There is no paid plan, no trial that ends and no payment code in the project. The limits that exist are operational and are explained where they apply.",
  },
  {
    id: "deletion",
    question: "Will my data actually be deleted?",
    answer:
      "That depends on the broker and on the law that applies to them. The product prepares the request, sends it after your approval and records the answer. It cannot compel anyone to act.",
  },
  {
    id: "storage",
    question: "What happens to the data I enter?",
    answer:
      "It stays in the instance you use. Identifiers are stored encrypted, shown masked, and used only inside requests that you approved. The interface explains for every field why it is collected.",
  },
  {
    id: "household",
    question: "Can I send requests for somebody else?",
    answer:
      "Only for another adult in your household, and only after that person has confirmed it through a link sent to their own email address. Profiles for children are not supported.",
  },
  {
    id: "sending",
    question: "Can the product send something without me?",
    answer:
      "No. A broker message requires your approval of the exact text, a valid consent record for the profile, a broker the operator marked as sendable, and external sending enabled for the instance.",
  },
  {
    id: "brokers",
    question: "Where does the broker list come from?",
    answer:
      "The list that ships with the software is demonstration data. Entries stay marked as unverified until an operator has checked the contact details against the broker's own published information.",
  },
  {
    id: "export",
    question: "Can I get my own data out again?",
    answer:
      "Yes. You can export the data of your account and generate reports that list what was sent, when it was sent and what came back.",
  },
  {
    id: "account-deletion",
    question: "What happens when I delete my account?",
    answer:
      "Your profiles, identifiers and evidence are deleted. The records that document what was sent are kept for the retention period the operator configured and are removed after that.",
  },
];
