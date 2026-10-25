"""Builds the GPI Command Center prototype deck with the WIT Deck 2 builder.

Run with the deck env:  python docs/deck/build_deck.py <screens dir> <out.pptx>
"""
import os
import sys

SKILL = ('/Users/syabanf/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/'
         'd96de9a2-d3f1-4120-b409-b0df46291a07/7a881940-79d3-4b7a-9e4b-0eddd4c50719/skills/wit-deck-2')
sys.path.insert(0, f'{SKILL}/scripts')
from witdeck import *  # noqa: E402,F403

SHOTS = sys.argv[1]
OUT = sys.argv[2]


def shot(name):
    return os.path.join(SHOTS, f'{name}.png')


d = Deck('GPI Command Center', 2026)

s, _ = d.cover(['GPI Command', 'Center'], 'Prototype', 'Gulf Power International')
d.notes(s, 'Frontend prototype of the Khobar Command Center for the five Yemen plants. All data is simulated.')

s, _ = d.agenda(['WHAT THIS', 'DECK COVERS'], [
    ('CONTEXT.', 'Five plants watched from Khobar', 'SLIDES 3–5'),
    ('MONITOR.', 'Overview, site plan, drill-down', 'SLIDES 6–9'),
    ('ALARMS.', 'Lifecycle, escalation, filters', 'SLIDES 10–12'),
    ('INSIGHTS.', 'Findings and the charts behind them', 'SLIDES 13–14'),
    ('ACCESS.', 'Roles and screens', 'SLIDES 15–16'),
    ('NEXT.', 'Status and next steps', 'SLIDES 17–18')],
    intro_head='GPI Command Center', intro='A read-only console for the 300 MW Yemen fleet, built as a clickable prototype.')
# The template's hashtag box is narrower than the text, so it wraps; widen it leftwards.
hashtag = find(s, 'agenda_hashtag')
hashtag.left -= 457200
hashtag.width += 457200

d.art_cards('CONTEXT. The GPI fleet', ['Five plants,', 'one console'], [
    ('The fleet', ['Five HFO plants in Hadramout and Aden, 300 MW planned',
                   'Al-Bidrah, Jul Masahah and Umbaikha operate today',
                   'Al-Ghurf commissions, Aden is under construction',
                   'Each site reaches Khobar over a Starlink link'], False),
    ('What the console answers', ['What each plant generates now, and how old that value is',
                                  'Which alarm needs whom, and who owns it',
                                  'How many hours of fuel each site has left',
                                  'Where construction and commissioning stand'], True)], art='industrial-ai')

d.compare('NEEDS. Problems and answers', 'Each operating question gets a screen.', 'What the Command Center needs', 'What the console does', [
    ('See every plant live, with honest data age', 'Values refresh every 5 s and every number shows its age'),
    ('Tell a quiet plant from a lost link', 'Late after 15 s, stale after 60 s, with a banner naming the age'),
    ('Make sure every alarm gets an owner', 'Ownerless alarms climb a level at 30, 60 and 120 minutes'),
    ('Know fuel stock before it runs out', 'Tank level and hours of supply per plant at the current burn'),
    ('Follow sites still being built', 'Milestones, issues, photos and progress that cannot go backwards')])

d.stats('CONTEXT. The fleet in numbers', 'The fleet the prototype models.', [
    ('300', 'MW planned across five plants'),
    ('160', 'MW commissioned today', True),
    ('32', 'engine units on the site plans'),
    ('5 s', 'sample interval for live values')],
    note='Plant names and planned capacities come from the discovery answers. Everything else is demo data.')

d.showcase('MONITOR. Fleet overview', 'One screen for the whole fleet.', [
    'Attention strip counts critical alarms, unacknowledged alarms and late sites',
    'Live fleet output against the 300 MW plan, with a 24-hour trend',
    'Yemen map with one marker per plant, coloured by alarm and link state',
    'Management view shows energy, billing, project progress and findings'],
    shot('overview'), tags=['Operations view', 'Management view'])

d.showcase('MONITOR. Site plan', 'Every plant opens on its own site plan.', [
    'Engine hall shows each genset coloured by state, with load and exhaust',
    'Tank farm, fuel treatment and switchyard carry live values',
    'Pick a zone to see its readings and open alarms beside the plan',
    'Camera pins open CCTV; a genset block opens the unit page'],
    shot('siteplan'), tags=['7 zones', 'Zone in URL'])

s, _ = d.steps('MONITOR. Drill-down', 'From the fleet map to one alarm in four taps.', [
    ('Fleet map', 'Five markers with output, alarm and link state'),
    ('Plant', 'Site plan, units, electrical, fuel, trend, sources'),
    ('Zone', 'Live values and open alarms for that area'),
    ('Unit', 'Exhaust, lube oil and coolant against limits'),
    ('Alarm', 'Next step, escalation path and full history')],
    callout=('Back lands where you left.', 'Each level keeps its tab, zone and filters in the URL, so a link opens the same view.'))

d.phones('MONITOR. On a phone', 'The same console runs on a phone.', [
    'A bottom bar replaces the side menu below tablet width',
    'The site plan scales down and zone chips take over selection',
    'Filters and menus open as bottom sheets',
    'A phone browser is enough; nothing to install'],
    [shot('phone-overview'), shot('phone-siteplan'), shot('phone-filters')], tags=['375 px checked'])

d.flow('ALARMS. Lifecycle and data age', 'How an alarm and a reading move.', [
    dict(label='Alarm lifecycle', before=[['Alarm raised', '(rule on site data)'], 'Acknowledged in Khobar'],
         question=['Owner', 'assigned?'], after=['Site crew resolves', ['Closed with', 'post-incident note']],
         no='Escalation timer raises level', note='Level 1 at 30 min -> level 2 at 60 -> level 3 at 120',
         note_at='no'),
    dict(label='Data freshness', before=[['Sample arrives', '(every 5 s)'], 'Age checked'],
         question=['Older than', '15 s?'], after=['Late badge on values', ['Stale banner', 'after 60 s']],
         no='Fresh value shown', note='Offline sites keep their last values, marked stale', note_at='after')])

d.showcase('ALARMS. Filtering', 'Find any alarm in two taps.', [
    'Filter by plant, priority, cause, owner, escalation level and time raised',
    'Each option shows how many alarms it would add before you pick it',
    'Active filters sit as chips you can remove one by one',
    'Quick views: unowned critical and high, assigned to me, escalated'],
    shot('alarms-filters'), tags=['Multi-select', 'Filters in URL'])

d.showcase('ALARMS. Alarm detail', 'The next step is always the main button.', [
    'Acknowledge, assign, resolve and close in order, each with a toast',
    'Critical and high alarms need a post-incident note before closing',
    'Escalation path shows who gets it next and when',
    'History records every action with the person or the timer behind it'],
    shot('alarm-detail'), tags=['4 steps', 'Blocked actions say why'])

d.showcase('INSIGHTS. Findings', 'The console points at what to fix first.', [
    'Rules turn readings and 30 days of history into ranked findings',
    'Each finding names the plant, the number and the page with the detail',
    'Examples: 16 MW out of service, 48 h of fuel left, comms losses tripled',
    'Overview and plant pages show their top findings too'],
    shot('insights'), tags=['17 findings', 'Most urgent first'])

d.showcase('INSIGHTS. Charts', 'The charts behind each finding.', [
    'Where the 300 MW goes: generating, idle, out of service, not built',
    'Availability heatmap per plant per day over 30 days',
    'Fuel per kWh against the 215 g/kWh baseline',
    'Alarm causes, share by plant, busiest hour and response times'],
    shot('insights-generation'), tags=['Generation', 'Fuel', 'Alarms'])

d.cards('ACCESS. Roles', 'Each role sees only the actions it can take.', [
    ('Command Center operator', ['Acknowledges, assigns, resolves and closes alarms', 'Exports reports'], True),
    ('Site O&M and project managers', ['O&M acknowledges and resolves alarms', 'Both record site progress with photos'], False),
    ('Senior management', ['Reads every screen and exports reports'], False)])

d.table('ACCESS. Screens', 'Thirteen screens in the prototype.', ['Screen', 'What it shows'], [
    ['Fleet overview', 'Operations and management views, map, findings'],
    ['Plants and plant detail', 'Site plan, units, electrical, fuel, 24 h trend, data sources'],
    ['Unit detail', 'Exhaust, lube oil and coolant gauges, alarm history'],
    ['Alarms and alarm detail', 'Filters and quick views, lifecycle, escalation, history'],
    ['Insights', 'Findings, capacity split, heatmap, fuel and alarm analytics'],
    ['Fuel', 'Tank stock, hours of supply, fuel per kWh, supply and return balance'],
    ['Projects and project detail', 'Milestones, issues, site photos, progress entry'],
    ['CCTV', 'Camera tiles per plant (placeholders)'],
    ['Reports', 'Daily, weekly and monthly summary, plant comparison, billing'],
    ['Data sources', 'Interface matrix, alarm register, escalation matrix, platform']],
    widths=[3, 7], light=True)

d.columns('NEXT. Status', 'Where the prototype stands.', [
    dict(status='done', head='Built', sub='Frontend prototype', items=[
        'Thirteen screens, phone to desktop', 'Simulated live telemetry', 'Alarm lifecycle and escalation',
        'Insights, site plan, filters', 'Role-based views']),
    dict(status='partial', status_label='WAITING ON GPI', head='Inputs', sub='To replace demo values', items=[
        ('Logo file and final palette', 'pending'), ('Plant coordinates', 'pending'), ('As-built site drawings', 'pending'),
        ('Approved alarm thresholds', 'pending'), ('Fuel and availability targets', 'pending')]),
    dict(status='todo', status_label='PHASE 2', head='Backend', sub='Real data', items=[
        'Site gateways and buffering', 'Ingestion API and storage in Khobar', 'Sign-in with MFA and audit log',
        'Interface survey per site']),
    dict(status='todo', status_label='LATER', head='AI', sub='Decision support', items=[
        'After data-governance approval', 'Advice only, no plant control'])])

d.cards('NEXT. Next steps', 'From prototype to a console on real data.', [
    ('GPI team', ['Send the logo file, plant coordinates and as-built drawings',
                  'Approve alarm thresholds, delays and priorities with the owner\'s engineer',
                  'Confirm the billing currency and the fuel and availability targets'], True),
    ('WIT team', ['Write end-to-end tests and the test reports for the prototype',
                  'Run the interface survey with each site',
                  'Design the ingestion API and site buffering for phase 2'], False)])

d.closing('The GPI Command Center prototype is ready for review with the Khobar team.', 'Review next',
          ['Site plan layouts', 'Alarm register', 'Insight rules'], [('Contact', 'business@wit.id')])

d.save(OUT)
print('saved', OUT, '-', d.page, 'slides')
