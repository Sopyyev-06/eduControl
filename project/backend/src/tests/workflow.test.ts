import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_STATUS,
  canDecideChangeRequest,
  canPerform,
  changeApproverRole,
  isImmutable,
  needsRequestInsteadOfEdit,
  nextStatus,
} from '../core/workflow';

test('workflow: happy path vice_dean -> dean -> rectorate', () => {
  assert.equal(nextStatus(REPORT_STATUS.DRAFT, 'submit'), REPORT_STATUS.TO_DEAN);
  assert.equal(nextStatus(REPORT_STATUS.TO_DEAN, 'dean_approve'), REPORT_STATUS.TO_RECTORATE);
  assert.equal(nextStatus(REPORT_STATUS.TO_RECTORATE, 'rectorate_approve'), REPORT_STATUS.APPROVED);
});

test('workflow: an approved report is immutable and cannot transition', () => {
  assert.equal(isImmutable(REPORT_STATUS.APPROVED), true);
  assert.equal(nextStatus(REPORT_STATUS.APPROVED, 'rectorate_approve'), null);
  assert.equal(canPerform(REPORT_STATUS.APPROVED, 'dean_approve', 'dean'), false);
});

test('workflow: role gates are enforced per stage', () => {
  assert.equal(canPerform(REPORT_STATUS.DRAFT, 'submit', 'vice_dean'), true);
  assert.equal(canPerform(REPORT_STATUS.TO_DEAN, 'dean_approve', 'vice_dean'), false);
  assert.equal(canPerform(REPORT_STATUS.TO_DEAN, 'dean_approve', 'dean'), true);
  assert.equal(canPerform(REPORT_STATUS.TO_RECTORATE, 'rectorate_approve', 'rectorate_staff'), true);
  assert.equal(canPerform(REPORT_STATUS.TO_RECTORATE, 'rectorate_approve', 'dean'), false);
  assert.equal(canPerform(REPORT_STATUS.TO_RECTORATE, 'submit', 'vice_dean'), false);
});

test('spec 4.2: approver follows the report stage, not the requester', () => {
  assert.equal(changeApproverRole(REPORT_STATUS.DRAFT), null);
  assert.equal(changeApproverRole(REPORT_STATUS.TO_DEAN), 'dean');
  assert.equal(changeApproverRole(REPORT_STATUS.TO_RECTORATE), 'rectorate');
  assert.equal(changeApproverRole(REPORT_STATUS.APPROVED), 'rectorate');
  assert.equal(canDecideChangeRequest(REPORT_STATUS.TO_DEAN, 'dean'), true);
  assert.equal(canDecideChangeRequest(REPORT_STATUS.TO_DEAN, 'rector'), false);
  assert.equal(canDecideChangeRequest(REPORT_STATUS.TO_RECTORATE, 'rectorate_staff'), true);
  assert.equal(canDecideChangeRequest(REPORT_STATUS.TO_RECTORATE, 'dean'), false);
});

test('spec 4.2: submitted reports need a request, drafts do not', () => {
  assert.equal(needsRequestInsteadOfEdit(REPORT_STATUS.DRAFT), false);
  assert.equal(needsRequestInsteadOfEdit(REPORT_STATUS.TO_DEAN), true);
  assert.equal(needsRequestInsteadOfEdit(REPORT_STATUS.TO_RECTORATE), true);
  assert.equal(needsRequestInsteadOfEdit(REPORT_STATUS.APPROVED), true);
});
