# Data Isolation Gaps in routers.ts

## Already Isolated (team-based)
1. evaluation.list - uses teamId filtering for non-admin
2. evaluation.getById - checks teamId ownership
3. evaluation.update - checks teamId ownership
4. evaluation.delete - checks teamId ownership
5. gamePresenter.list - uses teamId filtering
6. gamePresenter.delete - checks teamId ownership
7. gamePresenter.updateStats - checks teamId ownership
8. gamePresenter.bulkUpdateStats - checks teamId ownership
9. dashboard.stats - uses teamId filtering
10. report.list - uses teamId filtering
11. gpAccess.list - uses teamId filtering
12. gpAccess.deactivate - checks teamId ownership
13. gpAccess.generateToken - checks userId ownership

## GAPS - Missing Isolation
1. evaluation.getByMonth (line 602) - NO isolation, returns ALL evaluations for month
2. evaluation.deleteByMonth (line 690) - NO isolation, deletes ALL evaluations for month
3. evaluation.deleteByDateRange (line 700) - NO isolation, deletes ALL evaluations in range
4. gamePresenter.fuzzySearch (line 774) - NO isolation, searches ALL GPs
5. gamePresenter.findBestMatch (line 792) - NO isolation, searches ALL GPs
6. gamePresenter.assignToTeam (line 748) - NO isolation check
7. errorFile.list (line 3040) - NO isolation, returns ALL error files
8. errorFile.delete (line 3047) - NO isolation check
9. errorScreenshot.list (line 3682) - NO isolation, returns ALL error screenshots
10. errorScreenshot.delete (line 3689) - NO isolation check
11. errorScreenshot.stats (line 3700) - NO isolation
12. attitudeScreenshot.list (line 3899) - NO isolation
13. attitudeScreenshot.listAll (line 3910) - NO isolation, uses getAllGamePresenters()
14. attitudeScreenshot.delete - NO isolation check
15. errorScreenshot.upload (line 3626) - uses getAllGamePresenters() for GP matching
16. attitudeScreenshot.upload (line 3823) - uses getAllGamePresenters() for GP matching

## Key Decision: Team-based vs User-based Isolation

Current system uses TEAM-based isolation (teamId). User wants USER-based isolation where each user has their own independent workspace.

For user-based isolation, we need to:
1. Filter by ctx.user.id instead of ctx.user.teamId for non-admin users
2. Use *ByUser() variants of db functions
3. Ensure all GP matching uses user's own GPs only
4. Error screenshots/attitude screenshots should be filtered by uploadedById
