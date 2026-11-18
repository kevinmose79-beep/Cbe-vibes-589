import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SchoolProfileView } from '../components/SchoolProfileView';
import { School } from '../types';

describe('Head of Institution (HOI) Phase 2 — SchoolProfileView Component', () => {
  const baseSchoolWithHoi: School = {
    id: '00000000-0000-0000-0000-000000000001',
    school_name: 'Muchorwe Comprehensive School',
    motto: 'Knowledge to Excel',
    county: 'Nakuru',
    postal_code: 'P.O. Box 100-20100',
    address: 'P.O. Box 100-20100',
    email: 'info@muchorwe.ac.ke',
    logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    principal_name: 'Mr Peter Omondi',
  };

  const baseSchoolWithoutHoi: School = {
    id: '00000000-0000-0000-0000-000000000001',
    school_name: 'Muchorwe Comprehensive School',
    motto: 'Knowledge to Excel',
    county: 'Nakuru',
    postal_code: 'P.O. Box 100-20100',
    address: 'P.O. Box 100-20100',
    email: 'info@muchorwe.ac.ke',
  };

  it('1. Renders the distinct HEAD OF INSTITUTION subsection header and guidance', () => {
    const html = renderToString(
      <SchoolProfileView school={baseSchoolWithHoi} onSaveSchool={() => {}} />
    );

    expect(html).toContain('HEAD OF INSTITUTION');
    expect(html).toContain('Head of Institution');
  });

  it('2. Renders the input with correct label, id, maxLength=80, and no placeholder', () => {
    const html = renderToString(
      <SchoolProfileView school={baseSchoolWithHoi} onSaveSchool={() => {}} />
    );

    // Label pointing to principal_name input
    expect(html).toContain('for="principal_name"');
    expect(html).toContain("Head of Institution&#x27;s Name");

    // Input attributes
    expect(html).toContain('id="principal_name"');
    expect(html).toMatch(/max[Ll]ength="80"/);
    const inputMatch = html.match(/<input[^>]*id="principal_name"[^>]*>/);
    expect(inputMatch).not.toBeNull();
    expect(inputMatch![0]).not.toMatch(/\splaceholder=/);
    expect(html).not.toContain('placeholder="e.g. Mr Peter Omondi"');
  });

  it('3. Pre-populates the existing principal_name when present on school', () => {
    const html = renderToString(
      <SchoolProfileView school={baseSchoolWithHoi} onSaveSchool={() => {}} />
    );

    expect(html).toContain('value="Mr Peter Omondi"');
    expect(html).not.toContain('value="undefined"');
    expect(html).not.toContain('value="null"');
  });

  it('4. Renders an empty input field when principal_name is undefined or missing', () => {
    const html = renderToString(
      <SchoolProfileView school={baseSchoolWithoutHoi} onSaveSchool={() => {}} />
    );

    // Should render value="" on the principal_name input
    expect(html).toContain('id="principal_name"');
    expect(html).toContain('value=""');
    expect(html).not.toContain('value="undefined"');
    expect(html).not.toContain('value="null"');
  });

  it('5. Renders with disabled attribute when readOnly=true', () => {
    const html = renderToString(
      <SchoolProfileView school={baseSchoolWithHoi} onSaveSchool={() => {}} readOnly={true} />
    );

    // In read-only mode, the input has disabled attribute
    const inputMatch = html.match(/<input[^>]*id="principal_name"[^>]*>/);
    expect(inputMatch).not.toBeNull();
    expect(inputMatch![0]).toContain('disabled=""');

    // And save button is not rendered
    expect(html).not.toContain('Save School Information');
  });

  it('6. Placement: HEAD OF INSTITUTION subsection appears below Logo/Badge and above Save button', () => {
    const html = renderToString(
      <SchoolProfileView school={baseSchoolWithHoi} onSaveSchool={() => {}} readOnly={false} />
    );

    const logoIndex = html.indexOf('School Logo / Badge');
    const hoiIndex = html.indexOf('HEAD OF INSTITUTION');
    const saveButtonIndex = html.indexOf('Save School Information');

    expect(logoIndex).toBeGreaterThan(-1);
    expect(hoiIndex).toBeGreaterThan(-1);
    expect(saveButtonIndex).toBeGreaterThan(-1);

    // Verifies: Below School Logo/Badge AND Above Save button
    expect(hoiIndex).toBeGreaterThan(logoIndex);
    expect(saveButtonIndex).toBeGreaterThan(hoiIndex);
  });

  it('7. Character allowance: accepts names with spaces, apostrophes, hyphens, and periods', () => {
    const schoolWithSpecialChars: School = {
      ...baseSchoolWithoutHoi,
      principal_name: "Dr. O'Connor-Smith",
    };

    const html = renderToString(
      <SchoolProfileView school={schoolWithSpecialChars} onSaveSchool={() => {}} />
    );

    expect(html).toContain('id="principal_name"');
    // React escapes apostrophe in HTML attribute value
    expect(html).toMatch(/value="Dr\.\s+(O&#x27;Connor-Smith|O'Connor-Smith)"/);
  });

  it('8. Clean clearing: renders empty value when principal_name is explicitly empty or null', () => {
    const schoolWithEmptyName: School = {
      ...baseSchoolWithoutHoi,
      principal_name: '',
    };

    const html = renderToString(
      <SchoolProfileView school={schoolWithEmptyName} onSaveSchool={() => {}} />
    );

    const inputMatch = html.match(/<input[^>]*id="principal_name"[^>]*>/);
    expect(inputMatch).not.toBeNull();
    expect(inputMatch![0]).toContain('value=""');
    expect(inputMatch![0]).not.toContain('value="null"');
    expect(inputMatch![0]).not.toContain('value="undefined"');
  });
});
